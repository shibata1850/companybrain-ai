import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAppUser } from '@/lib/authServer';
import { getPlanUsage } from '@/lib/planEnforce';

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
    const { data } = await db
      .from('avatars')
      .select('owner_email')
      .not('owner_email', 'is', null)
      .is('deleted_at', null);
    const emails = Array.from(
      new Set(
        (data ?? [])
          .map((r) => r.owner_email as string)
          .filter((e) => typeof e === 'string' && e.includes('@')),
      ),
    ).sort();
    // Decorate with the admin's own label for each user (never the
    // user's private display_name).
    const { data: labels } = await db
      .from('app_users')
      .select('email, admin_label');
    const labelByEmail = new Map(
      (labels ?? []).map((l) => [l.email as string, l.admin_label as string | null]),
    );
    const users = emails.map((email) => ({
      email,
      label: labelByEmail.get(email) ?? null,
    }));
    return NextResponse.json({ users });
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
  if (q) query = query.ilike('content', `%${q}%`);
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
