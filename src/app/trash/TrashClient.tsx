'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import SlideToConfirm from '@/components/SlideToConfirm';

type TrashedAvatar = {
  id: string;
  name: string;
  description: string | null;
  cover_image_path: string | null;
  deleted_at: string;
  created_at: string;
};

export default function TrashClient() {
  const [avatars, setAvatars] = useState<TrashedAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  // Brain pending hard-delete; null when the slide modal is closed.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trash', { cache: 'no-store' });
      const json = (await res.json()) as {
        avatars?: TrashedAvatar[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setAvatars(json.avatars ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function restore(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${id}/restore`, { method: 'POST' });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setAvatars((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteOne(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/avatars/${id}?permanent=true`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setAvatars((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setConfirmDeleteId(null);
    }
  }

  async function emptyTrash() {
    setBusy('__empty__');
    setError(null);
    try {
      const res = await fetch('/api/trash', { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setAvatars([]);
      setConfirmEmpty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path
            d="M7.5 2.5L4 6l3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        一覧へ
      </Link>

      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">ゴミ箱</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500">
            削除したブレインはここに保管されます。元に戻すか、完全に削除する
            ことができます。
          </p>
        </div>
        {avatars.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmEmpty(true)}
            className="shrink-0 rounded-full border border-red-200 px-4 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            ゴミ箱を空にする
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-neutral-400">読み込み中…</div>
      )}

      {!loading && avatars.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-16 text-center">
          <p className="text-neutral-500">ゴミ箱は空です。</p>
        </div>
      )}

      {!loading && avatars.length > 0 && (
      <ul className="grid grid-cols-1 gap-3 anim-stagger sm:grid-cols-2 lg:grid-cols-3">
        {avatars.map((a) => (
          <li
            key={a.id}
            className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
          >
            <div className="aspect-[4/3] bg-neutral-100 opacity-60">
              {/* No cover thumbnail here since the storage path is private
                  and signing all of them on a trash page is wasteful. */}
              <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                {a.name}
              </div>
            </div>
            <div className="space-y-2 p-4">
              <div>
                <h3 className="font-medium tracking-tight text-neutral-800">
                  {a.name}
                </h3>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  削除: {new Date(a.deleted_at).toLocaleString('ja-JP')}
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => restore(a.id)}
                  disabled={busy === a.id}
                  className="flex-1 rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-900 disabled:opacity-40"
                >
                  {busy === a.id ? '…' : '復元'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(a.id)}
                  disabled={busy === a.id}
                  className="flex-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  完全に削除
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      )}

      <SlideToConfirm
        open={confirmDeleteId !== null}
        title="完全に削除しますか?"
        description={
          (() => {
            const a = avatars.find((x) => x.id === confirmDeleteId);
            return a
              ? `「${a.name}」を完全に削除します。学習素材・履歴ともに復元できなくなります。`
              : 'このブレインを完全に削除します。復元できません。';
          })()
        }
        actionLabel="→ スライドして完全削除"
        tone="red"
        onConfirm={async () => {
          if (confirmDeleteId) await deleteOne(confirmDeleteId);
        }}
        onClose={() => setConfirmDeleteId(null)}
      />

      <SlideToConfirm
        open={confirmEmpty}
        title="ゴミ箱を空にしますか?"
        description={`ゴミ箱の ${avatars.length} 件すべてを完全に削除します。学習素材・履歴ともに復元できなくなります。`}
        actionLabel="→ スライドして全件削除"
        tone="red"
        onConfirm={emptyTrash}
        onClose={() => setConfirmEmpty(false)}
      />
    </div>
  );
}
