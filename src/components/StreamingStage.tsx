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
  | 'ended'
  | 'error';

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
export default function StreamingStage({
  avatarId,
  coverUrl,
  avatarName,
  onUserTranscript,
  onAgentTranscript,
}: {
  avatarId: string;
  coverUrl: string | null;
  avatarName: string;
  /** Optional hook the parent can use to log transcripts. */
  onUserTranscript?: (text: string) => void;
  onAgentTranscript?: (text: string) => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0); // mic level 0..1 for the visualizer

  const sessionRef = useRef<Session | null>(null);
  const sessionOpenRef = useRef(false);
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
    sessionOpenRef.current = false;
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
    if (!speakingRef.current) {
      speakingRef.current = true;
      setStatus('speaking');
    }
    source.onended = () => {
      if (
        speakingRef.current &&
        ctx.currentTime >= playheadRef.current - 0.05
      ) {
        speakingRef.current = false;
        setStatus('listening');
      }
    };
  }

  function handleMessage(message: LiveServerMessage) {
    // Audio + text from the model.
    const parts =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((message as any).serverContent?.modelTurn?.parts as
        | Array<{
            inlineData?: { data?: string; mimeType?: string };
            text?: string;
          }>
        | undefined) || [];
    for (const p of parts) {
      if (p.inlineData?.data && p.inlineData.mimeType?.startsWith('audio/')) {
        playAudioChunk(p.inlineData.data);
      }
      if (p.text) {
        onAgentTranscript?.(p.text);
      }
    }

    // Interruption signal — user started talking over the model.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((message as any).serverContent?.interrupted) {
      playheadRef.current = outputCtxRef.current?.currentTime ?? 0;
      speakingRef.current = false;
      setStatus('listening');
    }

    // Input transcription (if enabled by the model).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputTx = (message as any).serverContent?.inputTranscription?.text;
    if (inputTx) onUserTranscript?.(inputTx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outputTx = (message as any).serverContent?.outputTranscription?.text;
    if (outputTx) onAgentTranscript?.(outputTx);

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
    setStatus('connecting');
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
        model:
          tokenJson.model ||
          'gemini-2.5-flash-preview-native-audio-dialog',
        config: {
          responseModalities: [Modality.AUDIO],
        },
        callbacks: {
          onopen: () => {
            console.log('[live] session open');
            sessionOpenRef.current = true;
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
            // Surface the WebSocket close code / reason so we can tell
            // whether it was a quota issue, an unsupported model, a
            // permission denial, or a clean shutdown.
            const ce = e as CloseEvent;
            const reason = ce?.reason || '';
            const code = ce?.code;
            console.warn('[live] session closed', { code, reason });
            setStatus((s) => {
              if (s === 'error') return s;
              // Anything other than a clean shutdown surfaces as an error
              // so the user sees a hint instead of a silent end state.
              if (code !== undefined && code !== 1000 && code !== 1005) {
                setError(
                  `セッションが切断されました${
                    reason ? `: ${reason}` : ''
                  }${code ? ` (code ${code})` : ''}`,
                );
                return 'error';
              }
              return 'ended';
            });
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
    <div className="mx-auto w-full max-w-3xl space-y-3">
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
                <br />
                セッション中はクレジットを消費します。
              </p>
            </div>
            <button
              type="button"
              onClick={start}
              className="rounded-full bg-white px-5 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white/90"
            >
              {status === 'ended' ? 'もう一度始める' : 'セッションを開始'}
            </button>
          </div>
        )}

        {status === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/70 text-white">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-white" />
            <p className="text-sm">接続中…</p>
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
