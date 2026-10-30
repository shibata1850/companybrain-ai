import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authorizeAvatar, getAppUser } from '@/lib/authServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { getPlanUsage } from '@/lib/planEnforce';
import { fetchAllPages } from '@/lib/pageAll';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Append audit-log entries. Conversations run browser <-> Gemini Live
 * directly, so the client posts each finalised message here to build a
 * durable, organisation-side record independent of browser storage.
 *
 * Body: { entries: AuditEntry[] } or a single AuditEntry.
 */
type AuditEntry = {
  avatar_id?: string | null;
  avatar_name?: string | null;
  session_id?: string | null;
  actor?: string | null;
  role?: string;
  content?: string;
  sources?: unknown;
  escalation?: unknown;
};

export async function POST(req: NextRequest) {
  // Only logged-in users may append audit entries; without this anyone
  // could spam audit_logs and forge avatar_id / content.
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // 洪水ガード(キオスクの /api/kiosk/audit と同等)。通常の会話は
  // メッセージ確定ごとに1〜2件なので、この上限に正規の利用は当たらない。
  const limited = enforceRateLimit(`audit:${me.email}`, 120, 60_000);
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as
    | { entries?: AuditEntry[] }
    | AuditEntry
    | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const rawEntries: AuditEntry[] = Array.isArray(
    (body as { entries?: AuditEntry[] }).entries,
  )
    ? (body as { entries: AuditEntry[] }).entries
    : [body as AuditEntry];
  if (rawEntries.length > 50) {
    return NextResponse.json(
      { error: 'too many entries (max 50 per request)' },
      { status: 400 },
    );
  }

  // Actor is taken from the authenticated session, not the client
  // payload — that's the whole point of an audit trail.
  const actor = me.email;

  // avatar_id もクライアント値を鵜呑みにしない: 自分が使えるブレイン
  // (所有・共有)以外の ID は null に落とす。これを許すと、他人の
  // ブレインへ偽の活動を注入したり、依頼ブレインへ付け替えて質問数の
  // 課金を逃れたりできてしまう。
  const claimedIds = Array.from(
    new Set(
      rawEntries
        .map((e) => e?.avatar_id)
        .filter((v): v is string => typeof v === 'string' && v.length > 0),
    ),
  ).slice(0, 20);
  const usableIds = new Set<string>();
  for (const id of claimedIds) {
    const auth = await authorizeAvatar(id);
    if (auth.ok) usableIds.add(id);
  }

  const rows = rawEntries
    .filter((e) => e && typeof e.content === 'string' && e.content.trim())
    .map((e) => ({
      avatar_id: e.avatar_id && usableIds.has(e.avatar_id) ? e.avatar_id : null,
      avatar_name: e.avatar_name ?? null,
      session_id: e.session_id ?? null,
      actor,
      role: e.role === 'agent' ? 'agent' : 'user',
      content: (e.content as string).slice(0, 8000),
      sources: e.sources ?? null,
      escalation: e.escalation ?? null,
    }));
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const db = supabaseAdmin();
  const { error } = await db.from('audit_logs').insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, inserted: rows.length });
}

/**
 * Drill-down audit reader. `view` selects the step:
 *
 *   view=users   (admin only) → { users: string[] }
 *                distinct brain owners, to pick whose activity to audit
 *   view=brains&user=<email>  → { brains: [{id,name,last_activity}] }
 *                brains OWNED by that user (members forced to self)
 *   view=entries&user=<email>&avatar=<id>&q=<text>
 *                → { entries: [...] } where actor=user AND avatar=id
 *
 * Q1(a): a brain's own questions are filtered by actor, so an admin
 * proxying into someone's brain (actor=admin) never shows up in that
 * owner's audit view.
 */
export async function GET(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const view = url.searchParams.get('view') || 'entries';
  const db = supabaseAdmin();

  // ---- Step 1: list users to audit (admin only) ----
  if (view === 'users') {
    if (me.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    // 全件取得だと PostgREST の行上限(既定1000)で黙って欠落し、ブレインが
    // 1,000件を超えると監査対象から消えるユーザーが出る。管理者の統制手段が
    // 届かなくなるため、明示ページングで取得する。
    const { rows: ownerRows } = await fetchAllPages<{ owner_email: string }>(
      (from, to) =>
        db
          .from('avatars')
          .select('owner_email')
          .not('owner_email', 'is', null)
          .is('deleted_at', null)
          .order('owner_email', { ascending: true })
          .range(from, to),
    );
    const data = ownerRows;
    const emails = Array.from(
      new Set(
        (data ?? [])
          .map((r) => r.owner_email as string)
          .filter((e) => typeof e === 'string' && e.includes('@')),
      ),
    ).sort();
    // Decorate with the admin's own label for each user (never the
    // user's private display_name).
    const { rows: labels } = await fetchAllPages<{
      email: string;
      admin_label: string | null;
    }>((from, to) =>
      db
        .from('app_users')
        .select('email, admin_label')
        .order('email', { ascending: true })
        .range(from, to),
    );
    const labelByEmail = new Map(
      labels.map((l) => [l.email, l.admin_label ?? null]),
    );
    const users = emails.map((email) => ({
      email,
      label: labelByEmail.get(email) ?? null,
    }));
    // キオスク(展示URL)での会話は actor「kiosk」で記録される。
    // メール形式ではないため通常の一覧に出ず、せっかくの展示会話が
    // どこからも読めなくなる。記録が1件でもあれば仮想ユーザーとして
    // 先頭に出す(管理者のみの画面)。
    const { count: kioskCount } = await db
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('actor', 'kiosk');
    if ((kioskCount ?? 0) > 0) {
      users.unshift({ email: 'kiosk', label: 'キオスク(展示)' });
    }
    return NextResponse.json({ users });
  }

  // The user being audited. Members can only ever be themselves.
  const requestedUser = url.searchParams.get('user')?.trim().toLowerCase();
  const targetUser =
    me.role === 'admin' && requestedUser ? requestedUser : me.email.toLowerCase();

  // ---- Step 2: that user's owned brains ----
  if (view === 'brains') {
    // キオスク(仮想ユーザー)はブレインを所有しないので、会話記録から
    // 対象ブレインを導く(管理者のみ。メンバーは targetUser が常に
    // 自分のメールなのでここへは来ない)。
    if (targetUser === 'kiosk' && me.role === 'admin') {
      const { data: rows } = await db
        .from('audit_logs')
        .select('avatar_id, avatar_name, created_at')
        .eq('actor', 'kiosk')
        .order('created_at', { ascending: false })
        .limit(3000);
      const byBrain = new Map<string, { name: string | null; last: string }>();
      for (const r of rows ?? []) {
        const id = r.avatar_id as string | null;
        if (!id) continue;
        const cur = byBrain.get(id);
        if (!cur) {
          byBrain.set(id, {
            name: (r.avatar_name as string | null) ?? null,
            last: r.created_at as string,
          });
        } else if (!cur.name && r.avatar_name) {
          cur.name = r.avatar_name as string;
        }
      }
      // 記録に名前が無いブレインは avatars から補完する。
      const unnamed = Array.from(byBrain.entries())
        .filter(([, v]) => !v.name)
        .map(([id]) => id);
      if (unnamed.length > 0) {
        const { data: named } = await db
          .from('avatars')
          .select('id, name')
          .in('id', unnamed.slice(0, 100));
        for (const a of named ?? []) {
          const cur = byBrain.get(a.id as string);
          if (cur) cur.name = a.name as string;
        }
      }
      return NextResponse.json({
        user: targetUser,
        brains: Array.from(byBrain.entries()).map(([id, v]) => ({
          id,
          name: v.name ?? '(名称不明のブレイン)',
          last_activity: v.last,
        })),
      });
    }

    const { data: brains } = await db
      .from('avatars')
      .select('id, name')
      .eq('owner_email', targetUser)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Decorate with last activity (by the target user) per brain.
    const ids = (brains ?? []).map((b) => b.id as string);
    const lastByBrain = new Map<string, string>();
    if (ids.length > 0) {
      const { data: recent } = await db
        .from('audit_logs')
        .select('avatar_id, created_at')
        .in('avatar_id', ids)
        .eq('actor', targetUser)
        .order('created_at', { ascending: false })
        .limit(3000);
      for (const r of recent ?? []) {
        const id = r.avatar_id as string;
        if (!lastByBrain.has(id)) lastByBrain.set(id, r.created_at as string);
      }
    }
    return NextResponse.json({
      user: targetUser,
      brains: (brains ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        last_activity: lastByBrain.get(b.id as string) ?? null,
      })),
    });
  }

  // ---- Step 3: entries for one (user, brain) pair ----
  const avatar = url.searchParams.get('avatar')?.trim();
  if (!avatar) {
    return NextResponse.json({ entries: [] });
  }
  // Members may only read entries for a brain they own.
  if (me.role !== 'admin') {
    const { data: own } = await db
      .from('avatars')
      .select('id')
      .eq('id', avatar)
      .eq('owner_email', me.email)
      .single();
    if (!own) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }
  const q = url.searchParams.get('q')?.trim();
  // 呼び出し側が少件数だけ欲しい場合(会話画面の「最近の会話」等)に
  // 1,000件を丸ごと運ばないための上限指定。
  const limitRaw = Number(url.searchParams.get('limit'));
  const rowLimit =
    Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 1000
      ? Math.floor(limitRaw)
      : 1000;
  let query = db
    .from('audit_logs')
    .select(
      'id, avatar_id, avatar_name, session_id, actor, role, content, escalation, created_at',
    )
    .eq('avatar_id', avatar)
    .eq('actor', targetUser)
    .order('created_at', { ascending: false })
    .limit(rowLimit);
  if (q) {
    // Escape LIKE wildcards so user input is matched literally.
    const safe = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    query = query.ilike('content', `%${safe}%`);
  }
  // Plan enforcement: members only see history within their plan's
  // historyDays window. Admins see everything.
  if (me.role !== 'admin') {
    const usage = await getPlanUsage(me);
    const limit = usage.plan.limits.historyDays;
    if (limit !== 'unlimited') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(limit));
      query = query.gte('created_at', cutoff.toISOString());
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entries: data ?? [] });
}
