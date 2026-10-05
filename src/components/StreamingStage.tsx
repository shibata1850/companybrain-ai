'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import { TARGET_INPUT_RATE, floatTo16kPcm } from '@/lib/audioResample';

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
// Live-capable models and reconnect with the next candidate.
// 2026-09 時点の現行ラインナップに更新済み:
//   - gemini-3.8-live: 2026-09-24 GA の最新 Live モデル(移行先本命。
//     Live Avatar 映像出力にも対応)
//   - gemini-3.1-flash-live-preview: 2026-03 リリース
//   - gemini-2.5-flash-native-audio-*: 2026-10-16 提供終了予定のため
//     最終フォールバックとしてのみ残す(EOL 後は自然に素通りされる)
const LIVE_MODEL_FALLBACKS = [
  'gemini-3.8-live',
  'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-latest',
  'gemini-2.5-flash-native-audio-preview-12-2025',
];

const OUTPUT_SAMPLE_RATE = 24000;

/**
 * StreamingStage drives a Gemini Live API session: it mints an ephemeral
 * token via /api/streaming/token, opens a direct WebSocket, pumps the
 * user's microphone in at 16 kHz PCM, plays the model's 24 kHz PCM
 * response, and proxies search_knowledge tool calls back to
 * /api/avatars/[id]/knowledge so Gemini can ground its answers in the
 * persona's training material.
 */
/** 回答の根拠として引用した素材の断片。 */
export type SourceChunk = {
  text: string;
  /** 引用元の学習素材名(判明した場合)。 */
  materialName?: string | null;
  materialId?: string | null;
};

export type TranscriptSource = {
  query: string;
  /** 旧形式(文字列配列)で保存された会話との後方互換のため union にする。 */
  chunks: Array<string | SourceChunk>;
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
  avatarName,
  onMessage,
}: {
  avatarId: string;
  coverUrl: string | null;
  avatarName: string;
  /**
   * Fires once per completed turn (or on barge-in) with a full
   * transcript message. Parent appends to its conversation log
   * (localStorage + audit_logs 投稿 = 質問数カウントの基盤)。
   */
  onMessage?: (m: TranscriptMessage) => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  // Mirror status in a ref so event handlers (which capture stale state)
  // can read the current value without being recreated on every change.
  const statusRef = useRef<Status>('idle');
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0); // mic level 0..1 for the visualizer
  // Session timer (seconds since the WebSocket opened).
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  // Mirror of sessionStartedAt for stable callbacks (so `stop` doesn't
  // get recreated when a session starts — that previously triggered the
  // unmount-cleanup effect and killed the session immediately).
  const sessionStartedAtRef = useRef<number | null>(null);
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
  // Text-only session: the plan has no voice quota (free) or this
  // month's minutes are used up, so the server issued a TEXT-modality
  // token. No mic capture, no audio playback — answers arrive as
  // modelTurn text parts instead of outputTranscription.
  const textOnlyRef = useRef(false);
  const [textOnly, setTextOnly] = useState(false);
  const [voiceDisabledReason, setVoiceDisabledReason] = useState<
    'plan' | 'quota' | null
  >(null);
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
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playheadRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
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
  // Auto-continuation: the native-audio model self-stops mid-word at a
  // ~20s per-turn audio ceiling. When a turn ends without proper
  // sentence-ending punctuation we silently ask it to continue and
  // keep appending to the same message bubble, so long answers finish
  // across multiple turns without the user shortening anything.
  const continuationCountRef = useRef(0);
  const MAX_CONTINUATIONS = 6;
  // Manual turn control(押して話す)は gemini-3.8-live 移行で廃止。
  // ターン検出はサーバーの自動VADに任せ、マイクはセッション中ずっと
  // 流しっぱなしにする(自然な会話・割り込みが可能になる)。



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
    try {
      workletNodeRef.current?.disconnect();
    } catch {
      // ignore
    }
    workletNodeRef.current = null;
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
    // Report how many seconds of voice were actually consumed so plan
    // enforcement can sum per-month usage. Fire-and-forget, must not
    // block the cleanup or surface errors to the user. Text-only mode
    // (/ask 経由) は音声を一切使っていないので記録しない。
    const startedAt = sessionStartedAtRef.current;
    if (startedAt !== null && !textOnlyRef.current) {
      const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      if (seconds > 0) {
        try {
          void fetch('/api/streaming/end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatarId, seconds }),
            keepalive: true,
          });
        } catch {
          // ignore
        }
      }
    }
    sessionStartedAtRef.current = null;
    setSessionStartedAt(null);
    setElapsedSec(0);
    setStatus((s) => (s === 'error' ? s : 'ended'));
  }, [avatarId]);

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
      // The turn has settled. If the agent stopped mid-sentence (no
      // sentence-ending punctuation) it hit the per-turn audio limit —
      // ask it to continue instead of sealing a truncated message.
      const text = agentBufRef.current.trim();
      const endsCleanly =
        text.length === 0 || /[。.！!？?」』）)、]$/.test(text);
      if (
        !endsCleanly &&
        continuationCountRef.current < MAX_CONTINUATIONS &&
        sessionOpenRef.current &&
        !audioBlockedRef.current
      ) {
        continuationCountRef.current += 1;
        pendingFlushRef.current = false;
        requestContinuation();
        return;
      }
      pendingFlushRef.current = false;
      continuationCountRef.current = 0;
      flushTranscripts();
      if (speakingRef.current) {
        speakingRef.current = false;
        setStatus((s) => (s === 'speaking' ? 'listening' : s));
      }
    }, POLL_MS);
  }

  /**
   * Silently ask the model to keep going from where its audio cut off.
   * Sent as a text turn so it produces no user-side transcript and
   * doesn't appear in the chat log. The model's continued
   * outputTranscription appends to the same agentBuf, growing the one
   * message bubble until it finally ends on punctuation.
   */
  function requestContinuation() {
    const sess = sessionRef.current;
    if (!sess || !sessionOpenRef.current) return;
    setStatus('speaking');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sess as any).sendClientContent?.({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: '（システム指示）直前のあなたの発言が途中で切れました。重複させず、切れたところから続きを最後まで話してください。新しい前置きや挨拶は不要です。',
              },
            ],
          },
        ],
        turnComplete: true,
      });
    } catch (e) {
      console.warn('[live] requestContinuation failed:', e);
      // Couldn't continue — flush what we have so it's not lost.
      pendingFlushRef.current = false;
      continuationCountRef.current = 0;
      flushTranscripts();
    }
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
      // User is starting a new turn — accept the next model response
      // and reset the auto-continuation budget (this is real speech,
      // not our silent continuation nudge, which is sent as text).
      audioBlockedRef.current = false;
      continuationCountRef.current = 0;
      userBufRef.current += inputTx;
    }
    const outputTx = sc?.outputTranscription?.text;
    if (outputTx) {
      agentBufRef.current += outputTx;
      lastTranscriptAtRef.current = Date.now();
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
      // With automatic VAD disabled the server occasionally emits a
      // spurious `interrupted` with nothing in flight (seen at session
      // open). Only act when there's actually an agent turn to cut —
      // otherwise we'd needlessly set the audio block and risk
      // swallowing the next real answer.
      if (agentBufRef.current || activeSourcesRef.current.size > 0) {
        stopAllPlayback();
        flushTranscripts();
        audioBlockedRef.current = true;
        setStatus('listening');
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
            hits?: Array<{
              content: string;
              material_name?: string | null;
              material_id?: string | null;
            }>;
            error?: string;
          };
          const results = json.results || [];
          if (results.length > 0) {
            // 根拠表示には引用元付きの hits を使う。旧デプロイのレスポンス
            // (hits なし)でも壊れないよう results にフォールバックする。
            const chunks: Array<string | SourceChunk> = json.hits
              ? json.hits.map((h) => ({
                  text: h.content,
                  materialName: h.material_name ?? null,
                  materialId: h.material_id ?? null,
                }))
              : results;
            turnSourcesRef.current.push({ query, chunks });
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
        }),
      });
      const tokenJson = (await tokenRes.json()) as {
        token?: string;
        model?: string;
        voice?: string;
        textOnly?: boolean;
        voiceEnabled?: boolean;
        voiceDisabledReason?: 'plan' | 'quota' | null;
        error?: string;
      };
      // 音声なしプラン(または今月の音声上限到達): Live 接続は行わず、
      // テキスト質問を /ask(通常のHTTP API)に流すモードで開始する。
      // ネイティブ音声モデルは TEXT モダリティを受け付けないため、
      // Live 側でのテキスト専用セッションは成立しない(code 1007)。
      // 音声なしプラン・今月の音声上限到達: 接続せず、理由を表示して
      // 待機に戻る(テキスト質問のフォールバックはチャット再実装まで無し)。
      if (tokenRes.ok && tokenJson.textOnly) {
        textOnlyRef.current = true;
        setTextOnly(true);
        setVoiceDisabledReason(tokenJson.voiceDisabledReason ?? 'plan');
        setStatus('idle');
        return;
      }
      textOnlyRef.current = false;
      setTextOnly(false);
      setVoiceDisabledReason(null);
      if (!tokenRes.ok || !tokenJson.token) {
        throw new Error(tokenJson.error || `HTTP ${tokenRes.status}`);
      }
      const usedModel = tokenJson.model || 'gemini-3.8-live';

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
            setSessionStartedAt((prev) => {
              const next = prev ?? Date.now();
              sessionStartedAtRef.current = next;
              return next;
            });
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
      // サンプルレートは指定しない(ネイティブに任せる)。iOS は 16000 の
      // 強制指定を無視するうえ、非対応レートを強制すると onaudioprocess が
      // 発火しなくなることがある。実レートは floatTo16kPcm で 16kHz に
      // 変換して送るので、ここで固定する必要はない。
      const inputCtx = new InputCtx();
      inputCtxRef.current = inputCtx;
      await inputCtx.resume?.();
      const source = inputCtx.createMediaStreamSource(stream);
      const analyser = inputCtx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      source.connect(analyser);

      // マイクの Float32 フレームを受け取り、セッション中は常時 16kHz PCM
      // に変換して送る。ターンの切れ目はサーバーの自動VADが検出する。
      const sendFrame = (input: Float32Array, inRate: number) => {
        if (!sessionOpenRef.current || !sessionRef.current) return;
        const pcm = floatTo16kPcm(input, inRate);
        const b64 = int16ToBase64(pcm);
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sessionRef.current as any)?.sendRealtimeInput?.({
            audio: { data: b64, mimeType: `audio/pcm;rate=${TARGET_INPUT_RATE}` },
          });
        } catch {
          sessionOpenRef.current = false;
        }
      };

      // マイク取り込みは AudioWorklet を優先する。ScriptProcessorNode は
      // 廃止予定で、特にモバイル(iOS Safari 等)では onaudioprocess が
      // 発火しないことがあり「話しても無反応」の原因になりやすい。
      // AudioWorklet が使えない環境では従来の ScriptProcessor に落ちる。
      let capturing = false;
      try {
        if (inputCtx.audioWorklet) {
          const workletSrc = `
            class CBCapture extends AudioWorkletProcessor {
              process(inputs) {
                const ch = inputs[0] && inputs[0][0];
                if (ch && ch.length) this.port.postMessage(ch.slice(0));
                return true;
              }
            }
            registerProcessor('cb-capture', CBCapture);
          `;
          const blob = new Blob([workletSrc], {
            type: 'application/javascript',
          });
          const url = URL.createObjectURL(blob);
          await inputCtx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);
          const node = new AudioWorkletNode(inputCtx, 'cb-capture');
          workletNodeRef.current = node;
          node.port.onmessage = (ev) => {
            sendFrame(ev.data as Float32Array, inputCtx.sampleRate);
          };
          source.connect(node);
          // 出力はしない(スピーカーに回さない)。worklet は接続だけで動く。
          const sink = inputCtx.createGain();
          sink.gain.value = 0;
          node.connect(sink);
          sink.connect(inputCtx.destination);
          capturing = true;
        }
      } catch (werr) {
        console.warn(
          '[live] AudioWorklet 使用不可、ScriptProcessor にフォールバック:',
          werr,
        );
      }

      if (!capturing) {
        const processor = inputCtx.createScriptProcessor(2048, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (e) => {
          sendFrame(
            e.inputBuffer.getChannelData(0),
            e.inputBuffer.sampleRate,
          );
        };
        analyser.connect(processor);
        // ScriptProcessor needs to be in the graph to fire onaudioprocess
        // but we don't want the mic monitoring on the speakers.
        const sink = inputCtx.createGain();
        sink.gain.value = 0;
        processor.connect(sink);
        sink.connect(inputCtx.destination);
      }

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
        if (scaled > MIC_VOICE_THRESHOLD) {
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
      // マイク取得の失敗は分かりやすい日本語で案内する。アプリ内ブラウザ
      // (Google アプリ・LINE 等)ではマイクが使えないことが多く、
      // Safari / Chrome で開き直すと直る。
      const name = e instanceof DOMException ? e.name : '';
      let message = e instanceof Error ? e.message : String(e);
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        message =
          'マイクの使用が許可されていません。ブラウザのマイク権限を許可してください。アプリ内ブラウザで開いている場合は、Safari か Chrome で開き直してください。';
      } else if (name === 'NotFoundError') {
        message = 'マイクが見つかりません。マイクのある端末でお試しください。';
      } else if (
        typeof navigator !== 'undefined' &&
        !navigator.mediaDevices?.getUserMedia
      ) {
        message =
          'このブラウザではマイクを使えません。Safari か Chrome で開き直してください(アプリ内ブラウザは非対応のことがあります)。';
      }
      setError(message);
      setStatus('error');
      await stop();
    }
  }

  const isLive =
    status === 'connected' ||
    status === 'listening' ||
    status === 'thinking' ||
    status === 'searching' ||
    status === 'speaking';

  // Keyboard shortcuts. Skip when the user is typing in an input.
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          (el as HTMLElement).isContentEditable)
      );
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      if (isLive && e.key === 'Escape') {
        e.preventDefault();
        void stop();
      } else if (!isLive && e.code === 'KeyS') {
        // Quick start when not yet in a session.
        e.preventDefault();
        void start();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
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

  // ---- 画面: ワンボタンのリアルタイム会話 --------------------------
  // チャットUI・押して話す・写真ステージ・最小化バーは廃止し、
  // 「開始 → そのまま話す → 終了」だけの電話型に一本化した
  // (チャットは将来、別機能として再実装する)。
  const statusText =
    status === 'speaking'
      ? '話しています…'
      : status === 'listening'
        ? 'そのまま話しかけてください'
        : status === 'thinking'
          ? '考えています…'
          : status === 'searching'
            ? '資料を確認しています…'
            : status === 'connecting'
              ? '接続中…'
              : status === 'reconnecting'
                ? '再接続中…'
                : status === 'error'
                  ? 'エラーが発生しました'
                  : '待機中';

  return (
    <div className="flex h-full min-h-[24rem] w-full flex-1 flex-col items-center justify-between gap-6 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <div
          className={`h-32 w-32 overflow-hidden rounded-full bg-neutral-200 ring-4 transition-shadow sm:h-36 sm:w-36 ${
            status === 'speaking'
              ? 'animate-pulse ring-emerald-300'
              : status === 'thinking' || status === 'searching'
                ? 'ring-indigo-200'
                : 'ring-neutral-200'
          }`}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>

        <div className="text-center">
          <p className="text-xl font-bold tracking-tight">{avatarName}</p>
          <p className="mt-1 text-sm text-neutral-500">
            {statusText}
            {isLive && (
              <span className="ml-2 font-mono tabular-nums text-neutral-400">
                {formatElapsed(elapsedSec)}
              </span>
            )}
          </p>
        </div>

        {/* マイクが拾えていることを示す小さな波形。 */}
        {isLive && (
          <div className="flex h-6 items-end gap-1" aria-hidden>
            {Array.from({ length: 12 }).map((_, i) => {
              const m = 1 - Math.abs(i - 5.5) * 0.12;
              const active = status === 'listening' || status === 'thinking';
              const h = active ? 3 + Math.min(20, level * 44 * m) : 3;
              return (
                <span
                  key={i}
                  className="w-1 rounded-full bg-neutral-900/60 transition-[height] duration-75"
                  style={{ height: `${h}px` }}
                />
              );
            })}
          </div>
        )}

        {!isLive &&
          status !== 'connecting' &&
          status !== 'reconnecting' &&
          !textOnly && (
            <p className="max-w-[20rem] text-center text-xs leading-relaxed text-neutral-500">
              ボタンを押したら、そのまま話しかけてください。
              学習させた資料にもとづいて答えます。
            </p>
          )}


        {textOnly && (
          <p className="max-w-[20rem] rounded-xl bg-neutral-100 px-4 py-2.5 text-center text-xs leading-relaxed text-neutral-600">
            {voiceDisabledReason === 'quota'
              ? '今月の音声会話の上限に達しました(毎月1日にリセットされます)。'
              : '音声会話はスターター以上のプランで利用できます。'}
          </p>
        )}
        {error && (
          <p className="max-w-[20rem] text-center text-xs leading-relaxed text-red-600">
            {error}
          </p>
        )}
      </div>

      {/* 操作はひとつだけ: 開始 or 終了。 */}
      <div className="flex w-full flex-col items-center gap-1.5">
        {isLive || status === 'connecting' || status === 'reconnecting' ? (
          <>
            <button
              type="button"
              onClick={stop}
              aria-label="会話を終了する"
              className="grid h-16 w-16 place-items-center rounded-full bg-red-600 text-white shadow-lg transition active:scale-95"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <span className="text-xs font-bold text-red-600">終了</span>
          </>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={textOnly}
            className="rounded-full bg-neutral-900 px-10 py-4 text-base font-bold text-white shadow-lg transition hover:bg-neutral-700 active:scale-95 disabled:opacity-40"
          >
            {status === 'ended' || status === 'error'
              ? 'もう一度話す'
              : '話し始める'}
          </button>
        )}
        {/* 人物再現サービスの常設注記(利用規約 第7条)。 */}
        <p className="mt-1 max-w-[22rem] text-center text-[10px] leading-relaxed text-neutral-400">
          回答はAIによる再現であり、ご本人の発言ではありません。重要な判断は原典資料をご確認ください。
        </p>
      </div>
    </div>
  );
}

// ---- helpers ----

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
