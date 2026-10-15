'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * 展示モード(管理者専用)。
 *
 * キオスク(/kiosk)は展示端末に貼り付ける独立URLで、アプリの画面から
 * 辿れない。このページは管理者がその展示用URLを「組み立てて・コピーして・
 * 試す」ための入口。アクセスキーはサーバー環境変数から管理者にだけ返す。
 *
 * - リハーサルURL: キー不要。音声・APIを使わず演出だけを自動再生する
 *   (現地ビジョンの映り確認、社内プレビュー用)
 * - 本番URL: ?k=アクセスキー 付き。タッチで実際に音声会話が始まる
 */

const DEFAULT_BRAND = 'NEXT GEN AI SCHOOL';
const DEFAULT_QUESTIONS = ['「AIって、なに?」', '「何を持ち帰れるの?」', '「あなたは人間?」'];

type KioskAdminInfo = {
  configured: boolean;
  key?: string;
  avatar?: { id: string; name: string } | null;
  error?: string;
};

export default function AdminKioskPage() {
  const [role, setRole] = useState<'loading' | 'admin' | 'other'>('loading');
  const [info, setInfo] = useState<KioskAdminInfo | null>(null);
  const [origin, setOrigin] = useState('');

  // フォーム(すべて省略可。既定値のままなら URL に付けない)
  const [look, setLook] = useState<'sumi' | 'dot'>('sumi');
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [foot, setFoot] = useState('');
  const [coreChar, setCoreChar] = useState('');
  const [questionsText, setQuestionsText] = useState(
    DEFAULT_QUESTIONS.join('\n'),
  );
  const [copied, setCopied] = useState<'demo' | 'prod' | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((j: { user?: { role?: string } | null }) => {
        setRole(j?.user?.role === 'admin' ? 'admin' : 'other');
      })
      .catch(() => setRole('other'));
  }, []);

  useEffect(() => {
    if (role !== 'admin') return;
    fetch('/api/admin/kiosk')
      .then((r) => r.json())
      .then((j: KioskAdminInfo) => setInfo(j))
      .catch((e) =>
        setInfo({
          configured: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
  }, [role]);

  // 共通のクエリ(既定値は省いて URL を短く保つ)。
  const sharedParams = useMemo(() => {
    const p = new URLSearchParams();
    if (look !== 'sumi') p.set('look', look);
    if (brand.trim() && brand.trim() !== DEFAULT_BRAND)
      p.set('brand', brand.trim());
    if (foot.trim()) p.set('foot', foot.trim());
    if (coreChar.trim()) p.set('c', [...coreChar.trim()][0]);
    const qs = questionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (qs.length > 0 && qs.join('|') !== DEFAULT_QUESTIONS.join('|'))
      p.set('q', qs.join('|'));
    return p;
  }, [look, brand, foot, coreChar, questionsText]);

  const demoUrl = useMemo(() => {
    const p = new URLSearchParams(sharedParams);
    p.set('demo', '1');
    return `${origin}/kiosk?${p.toString()}`;
  }, [origin, sharedParams]);

  const prodUrl = useMemo(() => {
    if (!info?.key) return null;
    const p = new URLSearchParams(sharedParams);
    p.set('k', info.key);
    return `${origin}/kiosk?${p.toString()}`;
  }, [origin, sharedParams, info?.key]);

  async function copy(url: string, which: 'demo' | 'prod') {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // クリップボードが使えない環境では選択してもらう。
      window.prompt('このURLをコピーしてください', url);
    }
  }

  if (role === 'loading') {
    return <p className="text-sm text-neutral-400">読み込んでいます…</p>;
  }
  if (role !== 'admin') {
    return (
      <p className="text-sm text-neutral-500">
        このページは管理者のみ利用できます。
      </p>
    );
  }

  const inputCls =
    'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none';
  const labelCls = 'block text-xs font-bold text-neutral-500';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">展示モード</h1>
        <p className="mt-1 text-sm leading-relaxed text-neutral-500">
          巨大ビジョン・店頭サイネージに映すキオスク画面のURLを発行します。
          キオスクはログイン不要の独立ページで、URLを展示端末のブラウザで
          開くだけで動きます。
        </p>
      </div>

      {/* 設定状況 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <p className={labelCls}>本番で映るブレイン</p>
        {info === null ? (
          <p className="mt-1 text-sm text-neutral-400">確認しています…</p>
        ) : info.configured ? (
          <p className="mt-1 text-sm font-bold text-neutral-900">
            {info.avatar?.name ?? '(ブレインが見つかりません)'}
          </p>
        ) : (
          <p className="mt-1 text-sm leading-relaxed text-red-600">
            キオスクが未設定です。Vercel の環境変数 KIOSK_ACCESS_KEY と
            KIOSK_AVATAR_ID を設定してください。
            {info.error ? `(${info.error})` : ''}
          </p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">
          映すブレインの変更は Vercel の環境変数 KIOSK_AVATAR_ID
          の差し替えで行います(画面からは変更できない設計です)。
        </p>
      </div>

      {/* 表示設定 */}
      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div>
          <p className={labelCls}>仕上げ</p>
          <div className="mt-2 flex gap-2">
            {(
              [
                ['sumi', '墨(漆黒×太明朝)'],
                ['dot', 'ドット(8bit)'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setLook(v)}
                className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                  look === v
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="kioskBrand">
            催事名(左上の表示)
          </label>
          <input
            id="kioskBrand"
            className={`mt-1 ${inputCls}`}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder={DEFAULT_BRAND}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="kioskFoot">
            下部の案内(会場・開始日など。任意)
          </label>
          <input
            id="kioskFoot"
            className={`mt-1 ${inputCls}`}
            value={foot}
            onChange={(e) => setFoot(e.target.value)}
            placeholder="例: 北上駅前・北上開発ビル1F / 10.26 OPEN"
          />
          <p className="mt-1 text-xs text-neutral-400">
            「会話は記録されます」の告知は常に表示されます。
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor="kioskCore">
            中央の一文字(任意。空欄ならブレイン名から自動)
          </label>
          <input
            id="kioskCore"
            className={`mt-1 ${inputCls}`}
            value={coreChar}
            onChange={(e) => setCoreChar(e.target.value)}
            maxLength={2}
            placeholder="例: 綾"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="kioskQs">
            待機中の問いかけ(1行に1つ。縦書きでローテーション)
          </label>
          <textarea
            id="kioskQs"
            className={`mt-1 ${inputCls}`}
            rows={3}
            value={questionsText}
            onChange={(e) => setQuestionsText(e.target.value)}
          />
        </div>
      </div>

      {/* 発行されるURL */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-neutral-900">
            リハーサルURL(音声なし・誰でも開ける)
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            演出だけを自動再生します。現地ビジョンの映り確認や社内プレビューに。
            API費用はかかりません。
          </p>
          <p className="mt-2 break-all rounded-xl bg-neutral-50 p-3 font-mono text-xs text-neutral-700">
            {demoUrl}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => copy(demoUrl, 'demo')}
              className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-bold text-white transition hover:bg-neutral-700"
            >
              {copied === 'demo' ? 'コピーしました' : 'URLをコピー'}
            </button>
            <a
              href={demoUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-bold text-neutral-700 transition hover:border-neutral-400"
            >
              開いて確認
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-neutral-900">
            本番URL(タッチで音声会話が始まる)
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            アクセスキー付きのURLです。展示端末のブックマークにだけ保存し、
            SNS等には載せないでください。漏れた場合は Vercel の
            KIOSK_ACCESS_KEY を差し替えれば即失効します。
          </p>
          {prodUrl ? (
            <>
              <p className="mt-2 break-all rounded-xl bg-neutral-50 p-3 font-mono text-xs text-neutral-700">
                {prodUrl}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => copy(prodUrl, 'prod')}
                  className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-emerald-500"
                >
                  {copied === 'prod' ? 'コピーしました' : 'URLをコピー'}
                </button>
                <a
                  href={prodUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-bold text-neutral-700 transition hover:border-neutral-400"
                >
                  開いて確認
                </a>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-neutral-400">
              {info === null
                ? '確認しています…'
                : 'キオスクが未設定のため発行できません。'}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-neutral-400">
        会話は actor「kiosk」として監査ログに記録されます。現地には
        「会話は記録されます」の掲示を併用してください(画面下部にも
        常時表示されます)。
      </p>
    </div>
  );
}
