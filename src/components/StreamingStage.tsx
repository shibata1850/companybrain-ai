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
  | 'speaking'
  | 'reconnecting'
  | 'ended'
  | 'error';

// Transient close codes worth auto-retrying. 1011 is Gemini's
// "Internal error encountered" — common on long preview-model sessions.
const RETRYABLE_CLOSE_CODES = new Set([1006, 1011, 1012, 1013, 1014]);
const MAX_AUTO_RECONNECTS = 3;

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
export type TranscriptMessage = {
  role: 'user' | 'agent';
  text: string;
  at: number;
};

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
   * transcript message. Parent appends to its conversation log.
   */
  onMessage?: (m: TranscriptMessage) => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0); // mic level 0..1 for the visualizer

  const sessionRef = useRef<Session | null>(null);
  const sessionOpenRef = useRef(false);
  const manualStopRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Active output buffer sources so we can stop them when the user
  // barges in (server sends interrupted=true).
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  // Accumulators for the chat-format transcript — flushed on turn
  // boundaries / interrupts.
  const userBufRef = useRef('');
  const agentBufRef = useRef('');
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playheadRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
  const mutedRef = useRef(false);

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
    setLevel(0);
    setStatus((s) => (s === 'error' ? s : 'ended'));
  }, []);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  function playAudioChunk(base64: string) {
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
  function flushTranscripts() {
    const u = cleanTranscript(userBufRef.current);
    if (u) {
      onMessageRef.current?.({
        role: 'user',
        text: u,
        at: Date.now(),
      });
    }
    const a = cleanTranscript(agentBufRef.current);
    if (a) {
      onMessageRef.current?.({
        role: 'agent',
        text: a,
        at: Date.now(),
      });
    }
    userBufRef.current = '';
    agentBufRef.current = '';
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
    // strings we trust for the chat log.
    const inputTx = sc?.inputTranscription?.text;
    if (inputTx) userBufRef.current += inputTx;
    const outputTx = sc?.outputTranscription?.text;
    if (outputTx) agentBufRef.current += outputTx;

    // Barge-in: user started talking over the model. Kill the queued
    // audio so the agent goes silent immediately, then flush whatever
    // transcript fragments we've collected so they show up as separate
    // messages in the chat log.
    if (sc?.interrupted) {
      stopAllPlayback();
      flushTranscripts();
      setStatus('listening');
    }

    // End of turn — push the completed transcripts as messages.
    if (sc?.turnComplete || sc?.generationComplete) {
      flushTranscripts();
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
        try {
          const res = await fetch(`/api/avatars/${avatarId}/knowledge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
          });
          const json = (await res.json()) as {
            results?: string[];
            error?: string;
          };
          responses.push({
            id: call.id,
            name: call.name,
            response: { results: json.results || [], error: json.error },
          });
        } catch (e) {
          responses.push({
            id: call.id,
            name: call.name,
            response: { error: e instanceof Error ? e.message : String(e) },
          });
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
    setStatus((s) => (s === 'reconnecting' ? s : 'connecting'));
    try {
      const tokenRes = await fetch('/api/streaming/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId }),
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

      const ai = new GoogleGenAI({
        apiKey: tokenJson.token,
        // The SDK explicitly requires v1alpha when using an ephemeral
        // token — without this the constrained WebSocket session is
        // rejected by the gateway.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        httpOptions: { apiVersion: 'v1alpha' } as any,
      });

      const session = await ai.live.connect({
        model: tokenJson.model || 'gemini-2.5-flash-native-audio-latest',
        config: {
          responseModalities: [Modality.AUDIO],
        },
        callbacks: {
          onopen: () => {
            console.log('[live] session open');
            sessionOpenRef.current = true;
            reconnectAttemptsRef.current = 0;
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
            console.warn('[live] session closed', { code, reason });

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
        setLevel(Math.min(1, rms * 4));
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

  const isLive =
    status === 'connected' ||
    status === 'listening' ||
    status === 'speaking';

  return (
    <div className="w-full space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-900">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={avatarName}
            className="absolute inset-0 h-full w-full object-cover opacity-90"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/30">
            no cover
          </div>
        )}

        {/* Speaking pulse — radial glow that grows when the agent talks. */}
        {status === 'speaking' && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.45),transparent_60%)] animate-pulse" />
        )}

        {/* Mic-level halo — subtle ring that breathes with the user voice. */}
        {(status === 'listening' || status === 'speaking') && (
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl ring-inset transition-[box-shadow] duration-100"
            style={{
              boxShadow: `inset 0 0 ${20 + level * 60}px ${
                4 + level * 16
              }px rgba(255,255,255,${0.15 + level * 0.25})`,
            }}
          />
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
                    : 'bg-amber-400'
              }`}
            />
            {status === 'speaking'
              ? '話しています…'
              : status === 'listening'
                ? '聞いています'
                : '接続中'}
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
              onClick={stop}
              className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-neutral-800 backdrop-blur transition hover:bg-white"
            >
              セッション終了
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

// ---- helpers ----

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
