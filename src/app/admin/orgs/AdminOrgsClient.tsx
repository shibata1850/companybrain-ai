'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Org = {
  id: string;
  name: string;
  seats: number;
  used: number;
  seat_price_jpy: number | null;
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

  async function assign(
    id: string,
    email: string,
    role: 'company_admin' | 'member',
  ) {
    if (!email.trim()) return;
    setError(null);
    try {
      const res = await fetch('/api/admin/orgs/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), org_id: id, org_role: role }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
            会社(テナント)を作成し、会社管理者を任命します。会社管理者が
            自社メンバーをシート内で招待・管理します。
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
            <OrgRow key={o.id} org={o} onSeats={updateSeats} onAssign={assign} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrgRow({
  org,
  onSeats,
  onAssign,
}: {
  org: Org;
  onSeats: (id: string, next: number) => void;
  onAssign: (id: string, email: string, role: 'company_admin' | 'member') => void;
}) {
  const [seatDraft, setSeatDraft] = useState(String(org.seats));
  const [adminEmail, setAdminEmail] = useState('');

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
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={seatDraft}
            onChange={(e) => setSeatDraft(e.target.value)}
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
      <div className="mt-3 flex flex-col gap-2 border-t border-neutral-100 pt-3 sm:flex-row">
        <input
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="会社管理者にするメールアドレス(登録済み)"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            onAssign(org.id, adminEmail, 'company_admin');
            setAdminEmail('');
          }}
          className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-neutral-700"
        >
          会社管理者に任命
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-neutral-400">
        ※ 事前に「ユーザー管理」で対象メールを登録しておいてください。任命後は
        その人が自社メンバーを招待できます。
      </p>
    </li>
  );
}
