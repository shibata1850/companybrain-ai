'use client';

import { useEffect, useRef, useState } from 'react';

// Web Speech API typings — only the bits we use.
type SpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};
type SpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function MicButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string, isFinal: boolean) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    setSupported(getCtor() !== null);
  }, []);

  useEffect(() => {
    return () => {
      // Make sure we stop the recogniser when the component unmounts.
      rec.current?.abort();
    };
  }, []);

  function start() {
    setError(null);
    const Ctor = getCtor();
    if (!Ctor) {
      setError('お使いのブラウザは音声入力に対応していません');
      return;
    }
    try {
      const r = new Ctor();
      r.lang = 'ja-JP';
      r.continuous = false;
      r.interimResults = true;
      let finalText = '';
      r.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const t = res[0].transcript;
          if (res.isFinal) finalText += t;
          else interim += t;
        }
        onTranscript(finalText + interim, finalText.length > 0 && !interim);
      };
      r.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        setError(`音声認識エラー: ${e.error}`);
      };
      r.onend = () => {
        setListening(false);
      };
      rec.current = r;
      r.start();
      setListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function stop() {
    rec.current?.stop();
    setListening(false);
  }

  if (!supported) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-label={listening ? '録音を停止' : '音声で入力'}
        className={`grid h-8 w-8 place-items-center rounded-full border transition disabled:opacity-40 ${
          listening
            ? 'border-red-500 bg-red-500 text-white animate-pulse'
            : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-900'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <rect
            x="5"
            y="1.5"
            width="4"
            height="7"
            rx="2"
            fill="currentColor"
          />
          <path
            d="M3 7a4 4 0 0 0 8 0M7 11v1.5"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {error && (
        <div className="absolute right-0 top-9 z-10 w-56 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
