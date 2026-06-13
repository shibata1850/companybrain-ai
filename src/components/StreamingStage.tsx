'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from '@google/genai';

type Status =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'thinking'
  | 'searching'
  | 'speaking'
  | 'reconnecting'
  | 'ended'
  | 'error';

// Mic RMS threshold above which we consider the user "actively talking".
const MIC_VOICE_THRESHOLD = 0.06;
// How long the mic has to stay below the threshold after the user was
// talking before we flip to "thinking".
const SILENCE_AFTER_SPEECH_MS = 450;
// If the model never responds in this window, fall back to listening.
const THINKING_FALLBACK_MS = 15000;

// Transient close codes worth auto-retrying. 1011 is Gemini's
// "Internal error encountered" — common on long preview-model sessions.
const RETRYABLE_CLOSE_CODES = new Set([1006, 1011, 1012, 1013, 1014]);
const MAX_AUTO_RECONNECTS = 3;

// 1008 ("Operation is not implemented, or supported, or enabled") is a
// permanent rejection of the requested model for this API key — retrying
// the same config can never succeed. Instead we walk this list of known
// Live-capable models and reconnect with the next candidate. Whichever
// one opens successfully is cached in localStorage so future sessions
// start with it directly.
const LIVE_MODEL_FALLBACKS = [
  'gemini-2.5-flash-native-audio-latest',
  'gemini-2.5-flash-preview-native-audio-dialog',
  'gemini-live-2.5-flash-preview',
  'gemini-2.0-flash-live-001',
];

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

/**
 * StreamingStage drives a Gemini Live API session: it mints an ephemeral
 * token via /api/streaming/token, opens a direct WebSocket, pumps the
 * user's microphone in at 16 kHz PCM, plays the model's 24 kHz PCM
 * response, and proxies search_knowledge tool calls back to
 * /api/avatars/[id]/knowledge so Gemini can ground its answers in the
 * persona's training material.
 */
export type TranscriptSource = {
  query: string;
  chunks: string[];
};

export type TranscriptEscalation = {
  categories: string[];
  hints: string[];
};

export type TranscriptMessage = {
  id: string;
  role: 'user' | 'agent';
  text: string;
  at: number;
  pinned?: boolean;
  note?: string;
  rating?: 'up' | 'down' | null;
  /** Knowledge-base lookups Gemini performed while producing this
   * agent turn. Empty / undefined for user messages. */
  sources?: TranscriptSource[];
  /** Set when the user's question (or the matching agent reply) was
   * flagged as needing human supervisor confirmation. */
  escalation?: TranscriptEscalation;
};

function newMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function StreamingStage({
  avatarId,
  coverUrl,
  stageUrl,
  avatarName,
  onMessage,
  onPartial,
  onEditStage,
  minimized = false,
  onToggleMinimized,
}: {
  avatarId: string;
  coverUrl: string | null;
  /** Wider 16:9 backdrop image; falls back to coverUrl if null. */
  stageUrl?: string | null;
  avatarName: string;
  /**
   * Fires once per completed turn (or on barge-in) with a full
   * transcript message. Parent appends to its conversation log.
   */
  onMessage?: (m: TranscriptMessage) => void;
  /**
   * Streams in-progress transcript text as it arrives. Called with
   * (role, text) on each chunk and (role, null) when that role's
   * partial should be cleared (e.g. turn complete).
   */
  onPartial?: (role: 'user' | 'agent', text: string | null) => void;
  /** Fires when the user clicks the "背景を変更" affordance on the stage. */
  onEditStage?: () => void;
  /** When true, the stage collapses to a slim status bar. */
  minimized?: boolean;
  /** Fires when the user toggles the minimise button on the stage. */
  onToggleMinimized?: () => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  // Mirror status in a ref so event handlers (which capture stale state)
  // can read the current value without being recreated on every change.
  const statusRef = useRef<Status>('idle');
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0); // mic level 0..1 for the visualizer
  const [textDraft, setTextDraft] = useState('');
  // Session timer (seconds since the WebSocket opened).
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  // VAD bookkeeping for the "thinking" state.
  const userTalkingRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (sessionStartedAt === null) return;
    const tick = () => {
      setElapsedSec(Math.floor((Date.now() - sessionStartedAt) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  const sessionRef = useRef<Session | null>(null);
  const sessionOpenRef = useRef(false);
  const manualStopRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Model-fallback state for 1008 rejections. modelOverrideRef is the
  // model we'll request from the token endpoint (null = server default);
  // triedModelsRef tracks what already got rejected this session.
  const modelOverrideRef = useRef<string | null>(null);
  const triedModelsRef = useRef<Set<string>>(new Set());
  // Active output buffer sources so we can stop them when the user
  // barges in (server sends interrupted=true).
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  // Accumulators for the chat-format transcript — flushed on turn
  // boundaries / interrupts.
  const userBufRef = useRef('');
  const agentBufRef = useRef('');
  // Knowledge-base lookups Gemini ran during the in-progress turn —
  // attached to the next agent message when the turn flushes.
  const turnSourcesRef = useRef<TranscriptSource[]>([]);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  const onPartialRef = useRef(onPartial);
  useEffect(() => {
    onPartialRef.current = onPartial;
  }, [onPartial]);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playheadRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
  // When the last agent audio finished — used to keep the half-duplex
  // mic gate closed briefly after playback so the speaker echo tail
  // doesn't register as user speech.
  const speakingEndedAtRef = useRef(0);
  const mutedRef = useRef(false);
  // When `interrupted` fires we cancel the audio queue, but the server
  // keeps streaming chunks from the in-flight generation for several
  // more seconds. Those late chunks would re-open the speaker and
  // re-close the half-duplex mic gate, so the next user question is
  // swallowed and the session looks frozen. Block further audio
  // playback after an interrupt until the user clearly starts a new
  // turn (inputTranscription arrives, or text input is sent).
  const audioBlockedRef = useRef(false);
  // turnComplete can arrive before the trailing outputTranscription
  // chunks (transcript lags its own audio in some Live API builds).
  // Flushing on the immediate turnComplete in that window truncates
  // the agent message mid-sentence — usually at a comma or article
  // number where it was about to continue. Latch instead: defer the
  // flush until the audio queue actually drains, so we capture the
  // late-arriving transcript before sealing the message.
  const pendingFlushRef = useRef(false);
  const pendingFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Last time an outputTranscription chunk landed in agentBufRef. The
  // flush poll uses this to wait for "no new transcript in N ms"
  // instead of a flat timeout — adapts to whatever the live wire is
  // actually doing, so slow-arriving trailing chunks still make it.
  const lastTranscriptAtRef = useRef(0);
  // Half-duplex by default: while the agent is speaking we don't send
  // mic audio upstream. Browser echo cancellation does NOT cover Web
  // Audio playback, so on speakers the agent's own voice comes back in
  // through the mic and the server treats it as a user barge-in —
  // truncating answers mid-sentence. Headphone users can enable
  // barge-in to talk over the agent again.
  const [bargeIn, setBargeIn] = useState(false);
  const bargeInRef = useRef(false);
  useEffect(() => {
    bargeInRef.current = bargeIn;
  }, [bargeIn]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const stop = useCallback(async () => {
    manualStopRef.current = true;
    sessionOpenRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    userTalkingRef.current = false;
    try {
      processorRef.current?.disconnect();
    } catch {
      // ignore
    }
    processorRef.current = null;
    analyserRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    try {
      await inputCtxRef.current?.close();
    } catch {
      // ignore
    }
    inputCtxRef.current = null;
    try {
      await outputCtxRef.current?.close();
    } catch {
      // ignore
    }
    outputCtxRef.current = null;
    try {
      sessionRef.current?.close();
    } catch {
      // ignore
    }
    sessionRef.current = null;
    playheadRef.current = 0;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    speakingRef.current = false;
    pendingFlushRef.current = false;
    if (pendingFlushTimerRef.current) {
      clearTimeout(pendingFlushTimerRef.current);
      pendingFlushTimerRef.current = null;
    }
    setLevel(0);
    setSessionStartedAt(null);
    setElapsedSec(0);
    setStatus((s) => (s === 'error' ? s : 'ended'));
  }, []);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  function playAudioChunk(base64: string) {
    // Drop chunks that arrive after an interrupt — they're ghost
    // audio from the cancelled generation and would otherwise re-open
    // the speaker and block the mic for the user's next question.
    if (audioBlockedRef.current) return;
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    const pcm = base64ToInt16(base64);
    if (pcm.length === 0) return;
    const float = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) float[i] = pcm[i] / 32768;
    const buffer = ctx.createBuffer(1, float.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const start = Math.max(ctx.currentTime, playheadRef.current);
    source.start(start);
    playheadRef.current = start + buffer.duration;
    activeSourcesRef.current.add(source);
    if (!speakingRef.current) {
      speakingRef.current = true;
      setStatus('speaking');
      if (thinkingTimerRef.current) {
        clearTimeout(thinkingTimerRef.current);
        thinkingTimerRef.current = null;
      }
    }
    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (
        speakingRef.current &&
        ctx.currentTime >= playheadRef.current - 0.05 &&
        activeSourcesRef.current.size === 0
      ) {
        speakingRef.current = false;
        speakingEndedAtRef.current = Date.now();
        setStatus((s) => (s === 'speaking' ? 'listening' : s));
      }
      // The pending-flush poll picks up the empty queue on its next
      // tick (max 300ms later), so trailing transcript chunks have
      // time to land before the message is sealed. No flush here.
    };
  }

  /**
   * Stop every queued / playing buffer source and reset the playhead.
   * Called when Gemini reports the user barged in.
   */
  function stopAllPlayback() {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
      try {
        src.disconnect();
      } catch {
        // ignore
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      playheadRef.current = outputCtxRef.current.currentTime;
    }
    speakingRef.current = false;
  }

  /**
   * Clean up a raw transcript buffer before showing it to the user:
   *  - strip Gemini control tokens like `<ctrl46>` / `<unk>` etc.
   *  - collapse whitespace runs
   *  - drop spaces inserted between adjacent CJK characters
   *    (Gemini emits one token per word so "あなた は 誰" comes out
   *    space-separated even though Japanese doesn't use spaces)
   */
  function cleanTranscript(raw: string): string {
    const stripped = raw
      .replace(/<ctrl[_-]?\d+>/gi, '')
      .replace(/<\/?(?:unk|eos|bos|pad|s)>/gi, '');
    // Drop spaces between two CJK / kana / kanji chars. Run twice in
    // case the matches overlap (every other space in a long run).
    const cjk =
      '[\\u3000-\\u9FFF\\uFF00-\\uFFEF\\u30A0-\\u30FF\\u3040-\\u309F]';
    const re = new RegExp(`(${cjk})\\s+(?=${cjk})`, 'g');
    const collapsed = stripped.replace(re, '$1').replace(re, '$1');
    return collapsed.replace(/[ \t]+/g, ' ').trim();
  }

  /**
   * Push the accumulated user / agent transcripts to the parent as
   * completed chat messages. Trims whitespace and skips empty strings.
   */
  /**
   * Poll the live-stream state and flush the agent transcript only
   * when (1) the audio queue is empty and (2) no new transcript chunk
   * has arrived in the last QUIET_MS. Re-arms while either condition
   * is unmet, so trailing chunks that arrive 500ms or more after
   * turnComplete still make it into the message before we seal it.
   * As a safety net, gives up after MAX_WAIT_MS so a dropped final
   * chunk can't leave the message in limbo forever.
   */
  function scheduleFlushPoll(startedAt: number = Date.now()) {
    if (pendingFlushTimerRef.current) {
      clearTimeout(pendingFlushTimerRef.current);
    }
    // QUIET_MS picked at 1500 after 700ms still missed bursty trailing
    // chunks — the native-audio Live stream can pause a full second
    // between bursts when the model is mid-thought.
    const QUIET_MS = 1500;
    const POLL_MS = 250;
    const MAX_WAIT_MS = 8000;
    pendingFlushTimerRef.current = setTimeout(() => {
      pendingFlushTimerRef.current = null;
      if (!pendingFlushRef.current) return;
      const audioBusy = activeSourcesRef.current.size > 0;
      const sinceLastChunk = Date.now() - lastTranscriptAtRef.current;
      const transcriptBusy = sinceLastChunk < QUIET_MS;
      const exhausted = Date.now() - startedAt > MAX_WAIT_MS;
      if ((audioBusy || transcriptBusy) && !exhausted) {
        scheduleFlushPoll(startedAt);
        return;
      }
      pendingFlushRef.current = false;
      flushTranscripts();
      if (speakingRef.current) {
        speakingRef.current = false;
        speakingEndedAtRef.current = Date.now();
        setStatus((s) => (s === 'speaking' ? 'listening' : s));
      }
    }, POLL_MS);
  }

  function flushTranscripts() {
    const u = cleanTranscript(userBufRef.current);
    if (u) {
      onMessageRef.current?.({
        id: newMessageId(),
        role: 'user',
        text: u,
        at: Date.now(),
      });
    }
    const a = cleanTranscript(agentBufRef.current);
    if (a) {
      const sources = turnSourcesRef.current;
      onMessageRef.current?.({
        id: newMessageId(),
        role: 'agent',
        text: a,
        at: Date.now(),
        sources: sources.length > 0 ? sources : undefined,
      });
    }
    userBufRef.current = '';
    agentBufRef.current = '';
    turnSourcesRef.current = [];
    onPartialRef.current?.('user', null);
    onPartialRef.current?.('agent', null);
  }

  function handleMessage(message: LiveServerMessage) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sc = (message as any).serverContent as
      | {
          modelTurn?: {
            parts?: Array<{
              inlineData?: { data?: string; mimeType?: string };
              text?: string;
            }>;
          };
          interrupted?: boolean;
          turnComplete?: boolean;
          generationComplete?: boolean;
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
        }
      | undefined;

    // Audio from the model. We deliberately ignore `parts[].text`
    // here: on the native-audio models that field can carry the
    // model's internal "thinking" / planning text, which leaks into
    // the transcript as messages like "Crafting a Professional
    // Response". The only authoritative record of what the user
    // actually heard is `outputTranscription` below.
    for (const p of sc?.modelTurn?.parts ?? []) {
      if (p.inlineData?.data && p.inlineData.mimeType?.startsWith('audio/')) {
        playAudioChunk(p.inlineData.data);
      }
    }

    // Live transcription chunks for both sides — these are the only
    // strings we trust for the chat log. Also forward the cleaned
    // partial to the parent so the chat panel can render it live
    // instead of waiting for the turn to finish.
    const inputTx = sc?.inputTranscription?.text;
    if (inputTx) {
      // User is starting a new turn — accept the next model response.
      audioBlockedRef.current = false;
      userBufRef.current += inputTx;
      onPartialRef.current?.('user', cleanTranscript(userBufRef.current));
    }
    const outputTx = sc?.outputTranscription?.text;
    if (outputTx) {
      agentBufRef.current += outputTx;
      lastTranscriptAtRef.current = Date.now();
      onPartialRef.current?.('agent', cleanTranscript(agentBufRef.current));
    }

    // Barge-in handling. This is the ROOT CAUSE of the long-standing
    // "answer cut off mid-sentence" bug: on speaker setups the agent's
    // own voice echoes back into the mic, the server reads it as the
    // user talking over the agent, fires `interrupted`, and we react by
    // killing playback + flushing the half-built transcript — chopping
    // both the audio and the message in the middle of a sentence. It
    // hits longer answers hardest (more echo exposure), which is
    // exactly the observed pattern.
    //
    // The fix: when barge-in is OFF (the default), the mic is gated
    // shut for the entire agent turn, so a *genuine* user interruption
    // is impossible — any `interrupted` we receive is therefore
    // spurious echo/noise and must be ignored. We only honor
    // interruptions when the user has explicitly enabled 🎧 割り込みON
    // (headphone mode), where talking over the agent is intended.
    if (sc?.interrupted) {
      console.warn(
        `[live] interrupted received (bargeIn=${bargeInRef.current ? 'ON' : 'OFF'}, status=${statusRef.current}, agentBuf=${agentBufRef.current.length} chars)`,
      );
      if (bargeInRef.current) {
        stopAllPlayback();
        flushTranscripts();
        audioBlockedRef.current = true;
        setStatus('listening');
      } else {
        // Half-duplex: ignore the spurious interrupt. Drop any stray
        // user transcript fragment so the log stays clean, but leave
        // the agent's audio and transcript intact to finish.
        userBufRef.current = '';
        onPartialRef.current?.('user', null);
      }
    }

    // End of turn — push the completed transcripts as messages.
    // generationComplete is intentionally NOT used as a flush trigger:
    // outputTranscription chunks can lag the audio, and flushing on
    // generationComplete clipped sentences mid-word. Even on
    // turnComplete the last transcript chunk can still be in flight,
    // so we always defer: wait for the audio queue to drain AND grant
    // a 300ms grace window for trailing transcript chunks to arrive.
    if (sc?.turnComplete) {
      pendingFlushRef.current = true;
      scheduleFlushPoll();
    }

    // Tool call — search the knowledge base and feed results back.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolCall = (message as any).toolCall as
      | {
          functionCalls?: Array<{
            id?: string;
            name?: string;
            args?: Record<string, unknown>;
          }>;
        }
      | undefined;
    if (toolCall?.functionCalls?.length) {
      void handleToolCalls(toolCall.functionCalls);
    }
  }

  async function handleToolCalls(
    calls: Array<{
      id?: string;
      name?: string;
      args?: Record<string, unknown>;
    }>,
  ) {
    const sess = sessionRef.current;
    if (!sess) return;
    // Surface "資料を検索中…" so the user can see retrieval is in flight.
    // Without this signal, the user thinks the session froze, talks
    // again, and the new audio triggers an interrupted event that
    // truncates the answer the model was about to produce.
    setStatus((s) =>
      s === 'reconnecting' || s === 'error' || s === 'ended'
        ? s
        : 'searching',
    );
    const responses: Array<{
      id?: string;
      name?: string;
      response: { results?: string[]; error?: string };
    }> = [];
    for (const call of calls) {
      if (call.name === 'search_knowledge') {
        const query =
          typeof call.args?.query === 'string'
            ? (call.args.query as string)
            : '';
        // Hard cap each retrieval so a slow embedding API or cold
        // Vercel function can't leave the model waiting indefinitely
        // (the 2-minute "session freeze" reported by the user).
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 15000);
        try {
          const res = await fetch(`/api/avatars/${avatarId}/knowledge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
            signal: abort.signal,
          });
          const json = (await res.json()) as {
            results?: string[];
            error?: string;
          };
          const results = json.results || [];
          if (results.length > 0) {
            turnSourcesRef.current.push({ query, chunks: results });
          }
          responses.push({
            id: call.id,
            name: call.name,
            response: { results, error: json.error },
          });
        } catch (e) {
          const aborted =
            e instanceof DOMException && e.name === 'AbortError';
          responses.push({
            id: call.id,
            name: call.name,
            response: {
              error: aborted
                ? 'search timed out after 15s'
                : e instanceof Error
                  ? e.message
                  : String(e),
            },
          });
        } finally {
          clearTimeout(timer);
        }
      } else {
        responses.push({
          id: call.id,
          name: call.name,
          response: { error: `unknown tool: ${call.name}` },
        });
      }
    }
    try {
      // SDK accepts either { functionResponses } or { toolResponse }.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sess as any).sendToolResponse?.({ functionResponses: responses });
    } catch (e) {
      console.warn('[live] sendToolResponse failed:', e);
    }
    // Tool results delivered — drop the "searching" badge so the next
    // status update (speaking / listening) lands cleanly.
    setStatus((s) => (s === 'searching' ? 'thinking' : s));
  }

  async function start() {
    setError(null);
    // Manual start (user clicked the button) — clear the reconnect
    // counter so a future hiccup gets its own fresh budget. The
    // reconnect path calls start() directly without resetting these.
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    manualStopRef.current = false;
    // Ask once for permission so we can ping the user when the agent
    // speaks while they have the tab buried.
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      try {
        await Notification.requestPermission();
      } catch {
        // user dismissed
      }
    }
    setStatus((s) => (s === 'reconnecting' ? s : 'connecting'));
    try {
      // Send modelOverrideRef only when an in-session 1008 fallback has
      // selected an alternate model. We deliberately do NOT seed it
      // from localStorage anymore: a stale cached model was overriding
      // the server's GEMINI_LIVE_MODEL env, so changing the model in
      // Vercel had no effect. The server env is now authoritative for
      // every fresh session; the fallback only kicks in on a real 1008.
      const tokenRes = await fetch('/api/streaming/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarId,
          model: modelOverrideRef.current || undefined,
          // Per-session: NO_INTERRUPTION on the server when the user
          // has 割り込みOFF, so server-side VAD can't kill the model
          // mid-sentence on echo. Toggling割り込みmid-session needs
          // a fresh session to take effect.
          bargeIn: bargeInRef.current,
        }),
      });
      const tokenJson = (await tokenRes.json()) as {
        token?: string;
        model?: string;
        voice?: string;
        error?: string;
      };
      if (!tokenRes.ok || !tokenJson.token) {
        throw new Error(tokenJson.error || `HTTP ${tokenRes.status}`);
      }
      const usedModel =
        tokenJson.model || 'gemini-2.5-flash-native-audio-latest';

      const ai = new GoogleGenAI({
        apiKey: tokenJson.token,
        // The SDK explicitly requires v1alpha when using an ephemeral
        // token — without this the constrained WebSocket session is
        // rejected by the gateway.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        httpOptions: { apiVersion: 'v1alpha' } as any,
      });

      const session = await ai.live.connect({
        model: usedModel,
        config: {
          responseModalities: [Modality.AUDIO],
        },
        callbacks: {
          onopen: () => {
            console.log('[live] session open', { model: usedModel });
            sessionOpenRef.current = true;
            reconnectAttemptsRef.current = 0;
            // Keep the working model in memory for this session's
            // reconnects, but no longer persist it across sessions —
            // the server env must stay authoritative (see start()).
            triedModelsRef.current.clear();
            modelOverrideRef.current = usedModel;
            // Start the session timer on the first successful open; on
            // auto-reconnect we keep the existing timer running.
            setSessionStartedAt((prev) => prev ?? Date.now());
            setStatus('listening');
          },
          onmessage: handleMessage,
          onerror: (e: ErrorEvent | Event) => {
            const msg =
              'message' in e && (e as ErrorEvent).message
                ? (e as ErrorEvent).message
                : 'streaming error';
            console.error('[live] error event:', e);
            sessionOpenRef.current = false;
            setError(msg);
            setStatus('error');
          },
          onclose: (e: CloseEvent | Event) => {
            sessionOpenRef.current = false;
            const ce = e as CloseEvent;
            const reason = ce?.reason || '';
            const code = ce?.code;
            // Chrome's console renders {code, reason} as "Object" until
            // expanded, which makes user-side diagnosis hard. Log the
            // values inline so a screenshot/copy already shows them.
            console.warn(
              `[live] session closed — code=${code ?? '?'} reason="${reason}"`,
            );

            // Clean shutdown / user clicked end / dev unmount.
            if (
              manualStopRef.current ||
              code === undefined ||
              code === 1000 ||
              code === 1005
            ) {
              setStatus((s) => (s === 'error' ? s : 'ended'));
              return;
            }

            // 1008: this key can't use the model we requested. Retrying
            // the same model is pointless — switch to the next known
            // Live model and reconnect with that instead.
            if (code === 1008) {
              triedModelsRef.current.add(usedModel);
              const next = LIVE_MODEL_FALLBACKS.find(
                (m) => !triedModelsRef.current.has(m),
              );
              if (next) {
                console.warn(
                  `[live] model "${usedModel}" rejected (1008) — trying "${next}"`,
                );
                modelOverrideRef.current = next;
                setStatus('reconnecting');
                reconnectTimerRef.current = setTimeout(() => {
                  void start();
                }, 400);
                return;
              }
              setError(
                'このAPIキーで利用できるリアルタイム会話モデルが見つかりませんでした。' +
                  '/api/debug/live-models で利用可能なモデルを確認し、' +
                  '.env.local の GEMINI_LIVE_MODEL を設定してください。' +
                  '(全候補がエラー code 1008 で拒否されました)',
              );
              setStatus('error');
              return;
            }

            // Transient server hiccup — auto-reconnect.
            if (
              RETRYABLE_CLOSE_CODES.has(code) &&
              reconnectAttemptsRef.current < MAX_AUTO_RECONNECTS
            ) {
              reconnectAttemptsRef.current += 1;
              setStatus('reconnecting');
              const delayMs = 800 * reconnectAttemptsRef.current;
              reconnectTimerRef.current = setTimeout(() => {
                void start();
              }, delayMs);
              return;
            }

            // Out of retries, or non-recoverable error.
            setError(
              `セッションが切断されました${
                reason ? `: ${reason}` : ''
              }${code ? ` (code ${code})` : ''}`,
            );
            setStatus('error');
          },
        },
      });
      sessionRef.current = session;

      // ---- output (Gemini → speakers) ----
      const OutputCtx = (
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext || window.AudioContext
      ) as typeof AudioContext;
      outputCtxRef.current = new OutputCtx({
        sampleRate: OUTPUT_SAMPLE_RATE,
      });
      // Some browsers gate audio output until user gesture; resume now.
      await outputCtxRef.current.resume?.();
      playheadRef.current = outputCtxRef.current.currentTime;

      // ---- input (mic → Gemini) ----
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          // Boost soft speech so the model has a stronger signal to work
          // with; helps a lot in quiet rooms and on built-in laptop mics.
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;
      const InputCtx = (
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext || window.AudioContext
      ) as typeof AudioContext;
      const inputCtx = new InputCtx({ sampleRate: INPUT_SAMPLE_RATE });
      inputCtxRef.current = inputCtx;
      await inputCtx.resume?.();
      const source = inputCtx.createMediaStreamSource(stream);
      const analyser = inputCtx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      const processor = inputCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        if (mutedRef.current) return;
        // Once the WebSocket has closed there's no point converting
        // and base64-encoding more audio — and the SDK throws on each
        // attempt, which we saw as a CLOSED-state spam loop.
        if (!sessionOpenRef.current || !sessionRef.current) return;
        // Half-duplex gate (割り込みOFF): drop mic frames while the
        // agent is actually speaking, plus a short echo tail. We do
        // NOT gate the thinking/searching window — doing so clipped the
        // tail of the user's own question whenever they paused briefly
        // mid-sentence. Spurious interrupts in the thinking window are
        // instead suppressed server-side via the lowered VAD start
        // sensitivity in realtimeInputConfig (see the token route).
        if (
          !bargeInRef.current &&
          (speakingRef.current ||
            Date.now() - speakingEndedAtRef.current < 400)
        ) {
          return;
        }
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const b64 = int16ToBase64(pcm);
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sessionRef.current as any)?.sendRealtimeInput?.({
            audio: {
              data: b64,
              mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
            },
          });
        } catch {
          // session probably closed; latch the flag so we stop trying.
          sessionOpenRef.current = false;
        }
      };
      source.connect(analyser);
      analyser.connect(processor);
      // ScriptProcessor needs to be in the graph to fire onaudioprocess
      // but we don't want the mic monitoring on the speakers.
      const sink = inputCtx.createGain();
      sink.gain.value = 0;
      processor.connect(sink);
      sink.connect(inputCtx.destination);

      // Mic-level visualizer.
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const scaled = Math.min(1, rms * 4);
        setLevel(scaled);

        // VAD-ish bookkeeping: notice when the user starts and stops
        // talking so we can transition into "thinking" once they go
        // silent and the model hasn't started speaking yet.
        const now = performance.now();
        if (!mutedRef.current && scaled > MIC_VOICE_THRESHOLD) {
          userTalkingRef.current = true;
          lastVoiceAtRef.current = now;
          if (thinkingTimerRef.current) {
            clearTimeout(thinkingTimerRef.current);
            thinkingTimerRef.current = null;
          }
        } else if (
          userTalkingRef.current &&
          now - lastVoiceAtRef.current > SILENCE_AFTER_SPEECH_MS
        ) {
          userTalkingRef.current = false;
          if (!speakingRef.current && sessionOpenRef.current) {
            setStatus((s) => (s === 'listening' ? 'thinking' : s));
            // Safety net: if the model never responds, drop back to
            // listening so the UI doesn't hang on "thinking".
            if (thinkingTimerRef.current)
              clearTimeout(thinkingTimerRef.current);
            thinkingTimerRef.current = setTimeout(() => {
              setStatus((s) => (s === 'thinking' ? 'listening' : s));
            }, THINKING_FALLBACK_MS);
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStatus('error');
      await stop();
    }
  }

  /**
   * Send a typed message into the live session. Useful when the user
   * doesn't want to (or can't) talk out loud. Mirrors the message into
   * the transcript log immediately so it shows up in chat.
   */
  function sendTextMessage(text: string) {
    const sess = sessionRef.current;
    if (!sess || !sessionOpenRef.current) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sess as any).sendClientContent?.({
        turns: [{ role: 'user', parts: [{ text: trimmed }] }],
        turnComplete: true,
      });
    } catch (e) {
      console.warn('[live] sendClientContent failed:', e);
      return;
    }
    onMessageRef.current?.({
      id: newMessageId(),
      role: 'user',
      text: trimmed,
      at: Date.now(),
    });
    // Any agent audio that was already playing should be cut off so it
    // doesn't talk over its new answer. Also lift the post-interrupt
    // audio block — a brand new turn just started.
    stopAllPlayback();
    audioBlockedRef.current = false;
  }

  function onTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!textDraft.trim()) return;
    sendTextMessage(textDraft);
    setTextDraft('');
  }

  const isLive =
    status === 'connected' ||
    status === 'listening' ||
    status === 'thinking' ||
    status === 'searching' ||
    status === 'speaking';

  // Keyboard shortcuts. Skip when the user is typing in an input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          (t as HTMLElement).isContentEditable)
      )
        return;
      // Space = toggle mute, Esc = end session — only while live.
      if (isLive && e.code === 'Space') {
        e.preventDefault();
        setMuted((m) => !m);
      } else if (isLive && e.key === 'Escape') {
        e.preventDefault();
        void stop();
      } else if (!isLive && e.code === 'KeyS') {
        // Quick start when not yet in a session.
        e.preventDefault();
        void start();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  // Browser notification: fire only when the agent transitions to
  // "speaking" and the tab is not currently visible.
  const prevStatusRef = useRef<Status>('idle');
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (
      status === 'speaking' &&
      prev !== 'speaking' &&
      typeof document !== 'undefined' &&
      document.hidden &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        const n = new Notification(`${avatarName} が話しています`, {
          body: 'タブに戻って続きを聞いてください。',
          icon: coverUrl || undefined,
          tag: `cb-${avatarName}`,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
        setTimeout(() => n.close(), 6000);
      } catch {
        // ignore
      }
    }
  }, [status, avatarName, coverUrl]);

  if (minimized) {
    return (
      <div className="w-full space-y-3">
        <CompactBar
          status={status}
          level={level}
          muted={muted}
          isLive={isLive}
          elapsedSec={elapsedSec}
          onToggleMute={() => setMuted((m) => !m)}
          onStop={stop}
          onStart={start}
          onExpand={onToggleMinimized}
          avatarName={avatarName}
          coverUrl={coverUrl}
        />
        {isLive && (
          <form
            onSubmit={onTextSubmit}
            className="flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-2 shadow-sm focus-within:border-neutral-900"
          >
            <input
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder={`${avatarName} にテキストで質問…`}
              className="flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-neutral-400"
            />
            <button
              type="submit"
              disabled={!textDraft.trim()}
              className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40"
            >
              送信
            </button>
          </form>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-900">
        {/* Minimise toggle — collapses the stage into a thin status bar. */}
        {onToggleMinimized && (
          <button
            type="button"
            onClick={onToggleMinimized}
            aria-label="ステージを隠す"
            className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-neutral-700 shadow-sm backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-white"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path
                d="M2 5h8M2 8h8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            ステージを隠す
          </button>
        )}
        {(stageUrl || coverUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stageUrl || coverUrl || ''}
            alt={avatarName}
            className="absolute inset-0 h-full w-full object-cover opacity-90"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/30">
            no cover
          </div>
        )}

        {/* Edit-stage-background affordance, only visible while idle. */}
        {!isLive && status !== 'connecting' && onEditStage && (
          <button
            type="button"
            onClick={onEditStage}
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-neutral-700 shadow-sm backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-white"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M11 1.5l3.5 3.5L5 14.5H1.5V11L11 1.5z"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            背景を変更
          </button>
        )}

        {/* Speaking pulse — radial glow that grows when the agent talks. */}
        {status === 'speaking' && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.45),transparent_60%)] animate-pulse" />
        )}

        {/* Mic-level halo — subtle ring that breathes with the user voice. */}
        {(status === 'listening' ||
          status === 'thinking' ||
          status === 'speaking') && (
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl ring-inset transition-[box-shadow] duration-100"
            style={{
              boxShadow: `inset 0 0 ${20 + level * 60}px ${
                4 + level * 16
              }px rgba(255,255,255,${0.15 + level * 0.25})`,
            }}
          />
        )}

        {/* Voice-activity bars: vibrating mini-equaliser at the bottom of
            the stage so the user can see at a glance that their mic is
            being heard. Visible whenever the session is active and not
            yet in the thinking/speaking flow. */}
        {(status === 'listening' || status === 'thinking') && !muted && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex h-8 items-end justify-center gap-1">
            {Array.from({ length: 7 }).map((_, i) => {
              // Bell-shaped multiplier so middle bars react more.
              const m = 1 - Math.abs(i - 3) * 0.18;
              const h = 4 + Math.min(28, level * 60 * m);
              return (
                <span
                  key={i}
                  className="w-1 rounded-full bg-white/85 shadow-[0_0_8px_rgba(255,255,255,0.35)] transition-[height] duration-75"
                  style={{ height: `${h}px` }}
                />
              );
            })}
          </div>
        )}

        {/* Thinking / searching overlay — three bouncing dots while the
            agent is processing the user's last turn or fetching docs. */}
        {(status === 'thinking' || status === 'searching') && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/35 text-white backdrop-blur-[2px]">
            <div className="flex items-end gap-1.5">
              <span
                className="h-2.5 w-2.5 animate-bounce rounded-full bg-white"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="h-2.5 w-2.5 animate-bounce rounded-full bg-white"
                style={{ animationDelay: '120ms' }}
              />
              <span
                className="h-2.5 w-2.5 animate-bounce rounded-full bg-white"
                style={{ animationDelay: '240ms' }}
              />
            </div>
            <p className="text-xs font-medium tracking-wide">
              {status === 'searching'
                ? '🔎 資料を検索中… 少しお待ちください'
                : '考えています…'}
            </p>
          </div>
        )}

        {/* Status pill */}
        {isLive && (
          <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white backdrop-blur">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                status === 'speaking'
                  ? 'animate-pulse bg-emerald-400'
                  : status === 'listening'
                    ? 'bg-emerald-400'
                    : status === 'thinking' || status === 'searching'
                      ? 'animate-pulse bg-indigo-300'
                      : 'bg-amber-400'
              }`}
            />
            {status === 'speaking'
              ? '話しています…'
              : status === 'listening'
                ? '聞いています'
                : status === 'searching'
                  ? '🔎 資料を検索中…'
                  : status === 'thinking'
                    ? '考えています…'
                    : '接続中'}
            <span
              className="ml-1 font-mono text-[10px] tabular-nums text-white/70"
              aria-label="経過時間"
            >
              {formatElapsed(elapsedSec)}
            </span>
          </div>
        )}

        {/* Idle / ended overlay */}
        {(status === 'idle' || status === 'ended') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-900/60 text-center text-white backdrop-blur-sm">
            <div>
              <p className="text-base font-medium">
                {avatarName} とリアルタイムで会話する
              </p>
              <p className="mt-1 text-xs text-white/70">
                マイクへのアクセスを許可してください。
              </p>
              <p className="mt-2 text-[10px] text-white/40">
                ショートカット: S で開始 / Space でマイク切替 / Esc で終了 / / で検索
              </p>
            </div>
            <button
              type="button"
              onClick={start}
              className="rounded-full bg-white px-5 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white/90"
            >
              始める
            </button>
          </div>
        )}

        {status === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/70 text-white">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-white" />
            <p className="text-sm">接続中…</p>
          </div>
        )}

        {status === 'reconnecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/80 text-white">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-amber-300" />
            <p className="text-sm">回線が一瞬切れました…再接続しています</p>
          </div>
        )}

        {/* Bottom control bar */}
        {isLive && (
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium backdrop-blur transition ${
                  muted
                    ? 'bg-red-500/90 text-white hover:bg-red-500'
                    : 'bg-white/90 text-neutral-800 hover:bg-white'
                }`}
              >
                {muted ? 'マイクOFF中(タップでON)' : 'マイクON'}
              </button>
              <button
                type="button"
                onClick={() => setBargeIn((v) => !v)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium backdrop-blur transition ${
                  bargeIn
                    ? 'bg-indigo-500/90 text-white hover:bg-indigo-500'
                    : 'bg-white/90 text-neutral-800 hover:bg-white'
                }`}
                title={
                  bargeIn
                    ? '応答中も声で割り込めます。スピーカー利用だと自分の声で誤中断することがあります(ヘッドホン推奨)'
                    : '応答中はマイクを止めて、回答が途切れないようにしています。割り込みたい場合はONに(ヘッドホン推奨)'
                }
              >
                {bargeIn ? '🎧 割り込みON' : '割り込みOFF'}
              </button>
            </div>
            <button
              type="button"
              onClick={stop}
              className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-neutral-800 backdrop-blur transition hover:bg-white"
            >
              セッション終了
            </button>
          </div>
        )}
      </div>

      {isLive && (
        <form
          onSubmit={onTextSubmit}
          className="flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-2 shadow-sm focus-within:border-neutral-900"
        >
          <input
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder={`${avatarName} にテキストで質問…`}
            className="flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-neutral-400"
          />
          <button
            type="submit"
            disabled={!textDraft.trim()}
            className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40"
          >
            送信
          </button>
        </form>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

// ---- helpers ----

function CompactBar({
  status,
  level,
  muted,
  isLive,
  elapsedSec,
  onToggleMute,
  onStop,
  onStart,
  onExpand,
  avatarName,
  coverUrl,
}: {
  status: Status;
  level: number;
  muted: boolean;
  isLive: boolean;
  elapsedSec: number;
  onToggleMute: () => void;
  onStop: () => void;
  onStart: () => void;
  onExpand?: () => void;
  avatarName: string;
  coverUrl: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-900 px-3 py-2 text-white shadow-sm">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt={avatarName}
          className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-white/30"
        />
      ) : (
        <span className="h-8 w-8 shrink-0 rounded-full bg-white/10" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              status === 'speaking'
                ? 'animate-pulse bg-emerald-400'
                : status === 'listening'
                  ? 'bg-emerald-400'
                  : status === 'thinking'
                    ? 'animate-pulse bg-indigo-300'
                    : status === 'idle' || status === 'ended'
                      ? 'bg-neutral-500'
                      : 'bg-amber-400'
            }`}
          />
          <span className="truncate">
            {status === 'speaking'
              ? '話しています…'
              : status === 'listening'
                ? '聞いています'
                : status === 'thinking'
                  ? '考えています…'
                  : status === 'connecting'
                    ? '接続中…'
                    : status === 'reconnecting'
                      ? '再接続中…'
                      : status === 'error'
                        ? 'エラー'
                        : isLive
                          ? 'スタンバイ'
                          : '停止中'}
            {isLive && (
              <span className="ml-1 font-mono tabular-nums text-white/60">
                {formatElapsed(elapsedSec)}
              </span>
            )}
          </span>
        </div>
        {/* Inline waveform */}
        {(status === 'listening' || status === 'thinking') && !muted && (
          <div className="mt-1 flex h-3 items-end gap-0.5">
            {Array.from({ length: 9 }).map((_, i) => {
              const m = 1 - Math.abs(i - 4) * 0.15;
              const h = 2 + Math.min(10, level * 22 * m);
              return (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-white/70 transition-[height] duration-75"
                  style={{ height: `${h}px` }}
                />
              );
            })}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isLive ? (
          <>
            <button
              type="button"
              onClick={onToggleMute}
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
                muted
                  ? 'bg-red-500 text-white hover:bg-red-400'
                  : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              {muted ? 'マイクOFF' : 'マイクON'}
            </button>
            <button
              type="button"
              onClick={onStop}
              className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-medium transition hover:bg-white/25"
            >
              終了
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="rounded-full bg-white px-3 py-1 text-[10px] font-medium text-neutral-900 transition hover:bg-white/90"
          >
            始める
          </button>
        )}
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            aria-label="ステージを表示"
            className="grid h-7 w-7 place-items-center rounded-full bg-white/15 transition hover:bg-white/25"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path
                d="M3 5l3-3 3 3M3 7l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function formatElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // PCM 16 little-endian.
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = '';
  // Chunk to avoid 'Maximum call stack size exceeded' on long arrays.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    );
  }
  return btoa(bin);
}
