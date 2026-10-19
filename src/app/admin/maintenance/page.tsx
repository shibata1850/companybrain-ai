'use client';

import { useEffect, useState } from 'react';

/**
 * メンテナンス(管理者専用)。
 *
 * いまは「埋め込みの後追い生成」のみ。学習素材の外部投入などで
 * 意味検索用ベクトル(embedding)が未生成のまま残ったチャンクを、
 * ボタン一つでまとめて埋め込む。未生成の間もキーワード検索では
 * 回答できるが、言い換え・文脈の一致(意味検索)には乗らない。
 */

export default function AdminMaintenancePage() {
  const [role, setRole] = useState<'loading' | 'admin' | 'other'>('loading');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((j: { user?: { role?: string } | null }) => {
        setRole(j?.user?.role === 'admin' ? 'admin' : 'other');
      })
      .catch(() => setRole('other'));
  }, []);

  useEffect(() => {
    if (role !== 'admin') return;
    fetch('/api/admin/reembed')
      .then((r) => r.json())
      .then((j: { remaining?: number; error?: string }) => {
        if (typeof j.remaining === 'number') setRemaining(j.remaining);
        else setError(j.error || '残数を取得できませんでした');
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [role]);

  async function runAll() {
    setRunning(true);
    setError(null);
    setLog([]);
    try {
      // 1回あたり最大100件。安全弁として最大30回で打ち切る。
      for (let i = 0; i < 30; i++) {
        const res = await fetch('/api/admin/reembed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 100 }),
        });
        const j = (await res.json()) as {
          processed?: number;
          failed?: number;
          remaining?: number;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        setRemaining(j.remaining ?? null);
        setLog((prev) => [
          ...prev,
          `${j.processed ?? 0}件を埋め込みました(残り ${j.remaining ?? '?'}件${
            j.failed ? `・失敗 ${j.failed}件` : ''
          })`,
        ]);
        if (!j.remaining || (j.processed ?? 0) === 0) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">メンテナンス</h1>
        <p className="mt-1 text-sm leading-relaxed text-neutral-500">
          ブレインの検索品質を保つための管理作業をまとめています。
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-neutral-900">
          意味検索用ベクトル(埋め込み)の生成
        </p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          学習素材の外部投入などで、意味検索用ベクトルが未生成のまま残った
          知識チャンクをまとめて埋め込みます。未生成の間もキーワード一致では
          回答できますが、言い換えや文脈での検索には乗りません。
        </p>
        <p className="mt-3 text-sm text-neutral-700">
          未生成チャンク:{' '}
          <span className="font-bold text-neutral-900">
            {remaining === null ? '確認中…' : `${remaining}件`}
          </span>
        </p>
        <button
          type="button"
          onClick={runAll}
          disabled={running || remaining === 0}
          className="mt-3 rounded-full bg-neutral-900 px-5 py-2 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:opacity-40"
        >
          {running
            ? '生成しています…'
            : remaining === 0
              ? '未生成はありません'
              : '埋め込みを生成する'}
        </button>
        {log.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-neutral-500">
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
        {error && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
