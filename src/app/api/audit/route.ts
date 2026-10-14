import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAppUser } from '@/lib/authServer';
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

  // Actor is taken from the authenticated session, not the client
  // payload — that's the whole point of an audit trail.
  const actor = me.email;

  const rows = rawEntries
    .filter((e) => e && typeof e.content === 'string' && e.content.trim())
    .map((e) => ({
      avatar_id: e.avatar_id || null,
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
    // scope=all: ブレイン所有者に限らず全アカウントを返す(利用実績
    // レポート用)。共有ブレインでしか会話しない体験ユーザーは avatars
    // の所有者一覧に現れないため、既定の一覧では拾えない。
    if (url.searchParams.get('scope') === 'all') {
      const { rows: allUsers } = await fetchAllPages<{
        email: string;
        admin_label: string | null;
      }>((from, to) =>
        db
          .from('app_users')
          .select('email, admin_label')
          .order('email', { ascending: true })
          .range(from, to),
      );
      return NextResponse.json({
        users: allUsers.map((r) => ({
          email: r.email,
          label: r.admin_label ?? null,
        })),
      });
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
    return NextResponse.json({ users });
  }

  // ---- 利用実績レポート(管理者のみ) ----
  // 体験導入の効果測定・実証事例づくり用。期間内の利用実績を「会話の
  // 中身を読まずに」件数だけ集計する(本文の閲覧は view=entries の監査
  // フローに限定する。営業資料に使う数字にプライバシーを混ぜない)。
  if (view === 'report') {
    if (me.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const user = url.searchParams.get('user')?.trim().toLowerCase();
    if (!user) {
      return NextResponse.json({ error: 'user is required' }, { status: 400 });
    }
    // 期間は日本時間の日付で受け取る。既定は直近30日。上限は「終了日の
    // 翌日0時 JST 未満」の排他境界にし、終了日の最終1秒を取りこぼさない。
    const toRaw = url.searchParams.get('to');
    const fromRaw = url.searchParams.get('from');
    const toDay = toRaw ? new Date(`${toRaw}T00:00:00+09:00`) : new Date();
    const toExclusive = toRaw
      ? new Date(toDay.getTime() + 24 * 60 * 60 * 1000)
      : new Date();
    const from = fromRaw
      ? new Date(`${fromRaw}T00:00:00+09:00`)
      : new Date(toExclusive.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (
      isNaN(from.getTime()) ||
      isNaN(toExclusive.getTime()) ||
      from >= toExclusive
    ) {
      return NextResponse.json({ error: 'invalid period' }, { status: 400 });
    }
    const fromIso = from.toISOString();
    const toIso = toExclusive.toISOString();

    try {
      // 件数系は head+count。sources は本文断片を含んで重いので、行取得は
      // 軽い列だけに絞る。
      const countBase = () =>
        db
          .from('audit_logs')
          .select('id', { count: 'exact', head: true })
          .eq('actor', user)
          .gte('created_at', fromIso)
          .lt('created_at', toIso);
      const counts = await Promise.all([
        countBase().eq('role', 'user'),
        countBase().eq('role', 'agent'),
        countBase().eq('role', 'agent').not('sources', 'is', null),
        countBase().eq('role', 'user').not('escalation', 'is', null),
      ]);
      // 集計はこのページの存在理由(営業の実証数字)なので、失敗を 0 に
      // 化けさせない。1つでもエラーなら 500 で正直に落とす。
      for (const c of counts) {
        if (c.error) throw new Error(c.error.message);
      }
      const [qs, ans, ansSrc, esc] = counts;

      const { rows, truncated } = await fetchAllPages<{
        role: string;
        created_at: string;
        session_id: string | null;
        avatar_id: string | null;
        avatar_name: string | null;
      }>((f, t) =>
        db
          .from('audit_logs')
          .select('role, created_at, session_id, avatar_id, avatar_name')
          .eq('actor', user)
          .gte('created_at', fromIso)
          .lt('created_at', toIso)
          .order('created_at', { ascending: true })
          .range(f, t),
      );
      const days = new Set<string>();
      const sessions = new Set<string>();
      const brainMap = new Map<
        string,
        { name: string | null; questions: number }
      >();
      for (const r of rows) {
        // 利用日は日本時間で数える。
        days.add(
          new Date(r.created_at).toLocaleDateString('ja-JP', {
            timeZone: 'Asia/Tokyo',
          }),
        );
        if (r.session_id) sessions.add(r.session_id);
        if (r.role === 'user' && r.avatar_id) {
          const cur = brainMap.get(r.avatar_id) ?? {
            name: r.avatar_name ?? null,
            questions: 0,
          };
          cur.questions += 1;
          if (!cur.name && r.avatar_name) cur.name = r.avatar_name;
          brainMap.set(r.avatar_id, cur);
        }
      }

      // 音声秒数も明示ページング(1,000行超で黙って欠落させない)。
      const { rows: voiceRows } = await fetchAllPages<{ seconds: number }>(
        (f, t) =>
          db
            .from('voice_sessions')
            .select('seconds')
            .eq('actor', user)
            .gte('created_at', fromIso)
            .lt('created_at', toIso)
            .order('created_at', { ascending: true })
            .range(f, t),
      );
      const voiceSeconds = voiceRows.reduce(
        (s, r) => s + Number(r.seconds ?? 0),
        0,
      );

      return NextResponse.json({
        user,
        from: fromIso,
        to: toIso,
        truncated,
        questions: qs.count ?? 0,
        answers: ans.count ?? 0,
        answersWithSources: ansSrc.count ?? 0,
        escalated: esc.count ?? 0,
        activeDays: days.size,
        sessions: sessions.size,
        voiceSeconds,
        brains: Array.from(brainMap.entries())
          .map(([id, b]) => ({ id, name: b.name, questions: b.questions }))
          .sort((a, b) => b.questions - a.questions),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `集計に失敗しました: ${message}` },
        { status: 500 },
      );
    }
  }

  // The user being audited. Members can only ever be themselves.
  const requestedUser = url.searchParams.get('user')?.trim().toLowerCase();
  const targetUser =
    me.role === 'admin' && requestedUser ? requestedUser : me.email.toLowerCase();

  // ---- Step 2: that user's owned brains ----
  if (view === 'brains') {
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
  let query = db
    .from('audit_logs')
    .select(
      'id, avatar_id, avatar_name, session_id, actor, role, content, escalation, created_at',
    )
    .eq('avatar_id', avatar)
    .eq('actor', targetUser)
    .order('created_at', { ascending: false })
    .limit(1000);
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
