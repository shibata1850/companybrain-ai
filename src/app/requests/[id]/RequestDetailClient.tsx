'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { StatusPill } from '../RequestsClient';

type Req = {
  id: string;
  requester_email: string;
  title: string;
  purpose: string;
  persona: string | null;
  materials: string | null;
  notes: string | null;
  status: '申請中' | '受理' | '対応中' | '完了' | '却下';
  assignee_email: string | null;
  result_avatar_id: string | null;
  delivered_avatar_id: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type Avatar = { id: string; name: string };

export default function RequestDetailClient({ id }: { id: string }) {
  const [me, setMe] = useState<{ email: string; role: 'admin' | 'member' } | null>(null);
  const [req, setReq] = useState<Req | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [myAvatars, setMyAvatars] = useState<Avatar[]>([]);
  const [linkAvatar, setLinkAvatar] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [admins, setAdmins] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [meRes, reqRes] = await Promise.all([
      fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()),
      fetch(`/api/requests/${id}`, { cache: 'no-store' }).then((r) => r.json()),
    ]);
    setMe(meRes.user ?? null);
    if (reqRes.error) setError(reqRes.error);
    else setReq(reqRes.request as Req);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Admin contacts, for the "受理後は管理者へメール" guidance.
  useEffect(() => {
    fetch('/api/auth/admins', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setAdmins(j.admins ?? []))
      .catch(() => {});
  }, []);

  // Admin: pull own avatars so they can attach one to the request.
  useEffect(() => {
    if (me?.role !== 'admin') return;
    fetch('/api/avatars', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setMyAvatars(j.avatars ?? []))
      .catch(() => {});
  }, [me]);

  async function patch(updates: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function transfer() {
    if (!req?.result_avatar_id) return;
    if (!confirm('このブレインを依頼者へ譲渡し、依頼を完了にします。よろしいですか?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${id}/transfer`, { method: 'POST' });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!req) {
    return (
      <div className="space-y-4">
        <Link href="/requests" className="text-xs text-neutral-500 hover:text-neutral-900">
          ← 依頼一覧へ
        </Link>
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-sm text-neutral-400">読み込み中…</p>
        )}
      </div>
    );
  }

  const isAdmin = me?.role === 'admin';
  const isOwner = me?.email === req.requester_email;
  const linkedAvatar = myAvatars.find((a) => a.id === req.result_avatar_id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/requests"
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        依頼一覧へ
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{req.title}</h1>
            <StatusPill status={req.status} />
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            依頼: {req.requester_email} ・ 申請日{' '}
            {new Date(req.created_at).toLocaleDateString('ja-JP')}
            {req.completed_at &&
              ` ・ 完了日 ${new Date(req.completed_at).toLocaleDateString('ja-JP')}`}
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Content sections */}
      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <Field label="用途・想定する質問">{req.purpose}</Field>
        {req.persona && <Field label="希望のペルソナ・口調">{req.persona}</Field>}
        {req.materials && (
          <Field label="学習させてほしい素材">
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-xs leading-relaxed">
              {req.materials}
            </pre>
          </Field>
        )}
        {req.notes && <Field label="補足">{req.notes}</Field>}
        {req.reject_reason && (
          <Field label="却下理由">
            <p className="text-sm text-red-700">{req.reject_reason}</p>
          </Field>
        )}
      </div>

      {/* Admin workflow */}
      {isAdmin && req.status !== '完了' && req.status !== '却下' && (
        <div className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
          <h2 className="text-sm font-semibold text-neutral-900">管理者の操作</h2>

          {/* Accept (受理): the point of no return for user cancellation */}
          {req.status === '申請中' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-neutral-700">
                依頼を受理すると、依頼者へ受理通知が届き、依頼者側からの
                取り下げはできなくなります。
              </p>
              <button
                type="button"
                onClick={() => patch({ status: '受理' })}
                disabled={busy}
                className="mt-2 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                この依頼を受理する
              </button>
            </div>
          )}

          {/* Status */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500">ステータス:</span>
            {(['申請中', '受理', '対応中'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => patch({ status: s })}
                disabled={busy || req.status === s}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  req.status === s
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-900'
                }`}
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => patch({ assignee_email: me?.email })}
              disabled={busy || req.assignee_email === me?.email}
              className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-700 hover:border-neutral-900 disabled:opacity-50"
            >
              {req.assignee_email === me?.email
                ? '自分が担当中'
                : '自分を担当にする'}
            </button>
          </div>

          {/* Create + attach */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
            <p className="mb-2 text-xs text-neutral-500">
              依頼の内容を見ながら、自分のアカウントでブレインを作成し、ここに紐付けてください。
              紐付けたあと「依頼者へ譲渡」で所有権を渡します。
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/avatars/new"
                className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
              >
                ＋ ブレインを作成
              </Link>
              <div className="flex flex-1 items-center gap-2">
                <select
                  value={linkAvatar || req.result_avatar_id || ''}
                  onChange={(e) => setLinkAvatar(e.target.value)}
                  className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
                >
                  <option value="">紐付けるブレインを選択…</option>
                  {myAvatars.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      result_avatar_id:
                        linkAvatar || req.result_avatar_id || null,
                    })
                  }
                  disabled={busy || !linkAvatar}
                  className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-900 disabled:opacity-50"
                >
                  紐付け
                </button>
              </div>
            </div>
            {req.result_avatar_id && (
              <p className="mt-2 text-[11px] text-neutral-500">
                紐付け中: {linkedAvatar?.name ?? '(あなたが所有していないブレイン)'}
              </p>
            )}
          </div>

          {/* Transfer */}
          <button
            type="button"
            onClick={transfer}
            disabled={busy || !req.result_avatar_id}
            className="w-full rounded-full bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-500 disabled:opacity-50"
          >
            依頼者({req.requester_email})へ譲渡して完了
          </button>

          {/* Reject */}
          <details className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
            <summary className="cursor-pointer text-xs text-neutral-500">
              却下する
            </summary>
            <div className="mt-2 space-y-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="却下理由"
                rows={2}
                className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  patch({ status: '却下', reject_reason: rejectReason })
                }
                disabled={busy || !rejectReason.trim()}
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                却下する
              </button>
            </div>
          </details>
        </div>
      )}

      {/* Requester cancel — allowed only before 受理 (while 申請中) */}
      {!isAdmin && isOwner && req.status === '申請中' && (
        <button
          type="button"
          onClick={() => {
            if (confirm('この依頼を取り下げますか?')) {
              patch({ status: '却下', reject_reason: '申請者がキャンセル' });
            }
          }}
          disabled={busy}
          className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-red-500 hover:text-red-600"
        >
          依頼を取り下げる
        </button>
      )}

      {/* After 受理: self-cancel is disabled; guide the user to email an admin */}
      {!isAdmin &&
        isOwner &&
        (req.status === '受理' || req.status === '対応中') && (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <p className="font-bold text-neutral-900">
              この依頼は受理されました
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              受理後は画面からの取り下げはできません。取り下げを希望される場合は、
              直接管理者へメールでご連絡ください。
            </p>
            {admins.length > 0 && (
              <a
                href={`mailto:${admins.join(',')}?subject=${encodeURIComponent(
                  `【依頼取り下げ希望】${req.title}`,
                )}&body=${encodeURIComponent(
                  `下記のブレイン作成依頼の取り下げを希望します。\n\n依頼: ${req.title}\n依頼ID: ${req.id}\n`,
                )}`}
                className="mt-3 inline-block rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-neutral-700"
              >
                管理者にメールで連絡する
              </a>
            )}
          </div>
        )}

      {req.status === '完了' && req.delivered_avatar_id && isOwner && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-bold text-green-800">
            ブレインが利用できます
          </p>
          <Link
            href={`/avatars/${req.delivered_avatar_id}`}
            className="mt-2 inline-block rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            ブレインを開く
          </Link>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
        {children}
      </div>
    </div>
  );
}
