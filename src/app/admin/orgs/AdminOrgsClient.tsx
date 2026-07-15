'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Org = {
  id: string;
  name: string;
  seats: number;
  used: number;
  seat_price_jpy: number | null;
  admins: string[];
};

/**
 * 運営者(スーパー管理者)向け: 組織の作成・シート数設定・会社管理者の
 * 任命。ここで会社(テナント)を作り、その会社管理者を割り当てると、
 * 以後はその会社管理者が自社メンバーをシート内で管理できる。
 */
export default function AdminOrgsClient() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [seats, setSeats] = useState('10');
  const [price, setPrice] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/orgs', { cache: 'no-store' });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as { orgs?: Org[]; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setOrgs(json.orgs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          seats: Number(seats) || 1,
          seat_price_jpy: price ? Number(price) : undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setName('');
      setSeats('10');
      setPrice('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function updateSeats(id: string, next: number) {
    setError(null);
    try {
      const res = await fetch('/api/admin/orgs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, seats: next }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 会社管理者をこの画面だけで作成する。事前登録は不要:
  // (1) 認証アカウント + allowlist を作り(既存なら無視)、
  // (2) その組織の会社管理者として割り当てる。
  async function createCompanyAdmin(id: string, email: string, password: string) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || password.length < 8) {
      setError('メールアドレスと8文字以上の初期パスワードを入力してください');
      return false;
    }
    setError(null);
    try {
      // 1) アカウント作成(既存メールなら allowlist を upsert するだけ)
      const create = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password, role: 'member' }),
      });
      const cj = (await create.json()) as { ok?: boolean; error?: string };
      if (!create.ok || !cj.ok) throw new Error(cj.error || `HTTP ${create.status}`);
      // 2) 会社管理者に割り当て
      const assign = await fetch('/api/admin/orgs/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, org_id: id, org_role: 'company_admin' }),
      });
      const aj = (await assign.json()) as { ok?: boolean; error?: string };
      if (!assign.ok || !aj.ok) throw new Error(aj.error || `HTTP ${assign.status}`);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          このページは管理者のみアクセスできます。
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">組織・シート管理</h1>
          <p className="mt-1 text-sm text-neutral-500">
            手順:① 会社を作成(会社名+シート数)→ ② その会社に「会社管理者」を
            追加。以後は会社管理者が自社メンバーをシート枠内で招待・管理します。
          </p>
        </div>
        <Link
          href="/admin/users"
          className="shrink-0 text-xs font-bold text-neutral-500 hover:text-neutral-900"
        >
          ユーザー管理へ
        </Link>
      </div>

      {/* 作成 */}
      <form
        onSubmit={createOrg}
        className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5"
      >
        <h2 className="text-sm font-bold text-neutral-900">会社を作成</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="会社名"
            required
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
          <input
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            placeholder="シート数"
            className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm tabular-nums focus:border-neutral-900 focus:outline-none"
          />
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="単価/月(任意)"
            className="w-36 rounded-lg border border-neutral-300 px-3 py-2 text-sm tabular-nums focus:border-neutral-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:opacity-50"
          >
            {creating ? '作成中…' : '作成'}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 一覧 */}
      {loading ? (
        <p className="py-10 text-center text-sm text-neutral-400">読み込み中…</p>
      ) : orgs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center text-sm text-neutral-500">
          まだ会社がありません。
        </div>
      ) : (
        <ul className="space-y-3">
          {orgs.map((o) => (
            <OrgRow
              key={o.id}
              org={o}
              onSeats={updateSeats}
              onCreateAdmin={createCompanyAdmin}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrgRow({
  org,
  onSeats,
  onCreateAdmin,
}: {
  org: Org;
  onSeats: (id: string, next: number) => void;
  onCreateAdmin: (id: string, email: string, password: string) => Promise<boolean>;
}) {
  const [seatDraft, setSeatDraft] = useState(String(org.seats));
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const ok = await onCreateAdmin(org.id, adminEmail, adminPw);
    setBusy(false);
    if (ok) {
      setAdminEmail('');
      setAdminPw('');
    }
  }

  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-neutral-900">{org.name}</p>
          <p className="text-[11px] text-neutral-500">
            シート {org.used} / {org.seats}
            {org.seat_price_jpy != null && (
              <> · 単価 ¥{org.seat_price_jpy.toLocaleString()}/月</>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            会社管理者:{' '}
            {org.admins.length > 0 ? (
              <span className="text-neutral-800">{org.admins.join(', ')}</span>
            ) : (
              <span className="text-amber-700">未設定</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={seatDraft}
            onChange={(e) => setSeatDraft(e.target.value)}
            aria-label="シート数"
            className="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-xs tabular-nums focus:border-neutral-900 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onSeats(org.id, Number(seatDraft) || org.seats)}
            className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-900"
          >
            シート更新
          </button>
        </div>
      </div>

      {/* 会社管理者をこの場で作成(事前登録不要) */}
      <div className="mt-3 border-t border-neutral-100 pt-3">
        <p className="mb-2 text-xs font-bold text-neutral-700">
          会社管理者を追加
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="担当者のメールアドレス"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 focus:outline-none"
          />
          <input
            type="text"
            value={adminPw}
            onChange={(e) => setAdminPw(e.target.value)}
            placeholder="初期パスワード(8文字以上)"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? '作成中…' : '会社管理者にする'}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-neutral-400">
          このメールで新しくアカウントを作成し、この会社の管理者に設定します
          (この画面だけで完結。既存メールなら管理者権限だけ付与)。設定した
          初期パスワードを本人にお伝えください。以後、その人が自社メンバーを
          招待・管理します。
        </p>
      </div>
    </li>
  );
}
