import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAppUser } from '@/lib/authServer';

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
  const me = await getAppUser();
  const actor = me?.email ?? null;

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
 * List recent audit entries for the review UI. Optional filters:
 *   ?avatar=<id>   only one brain
 *   ?q=<text>      substring match on content
 *   ?limit=<n>     default 200, max 1000
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const avatar = url.searchParams.get('avatar');
  const q = url.searchParams.get('q')?.trim();
  const limit = Math.min(
    1000,
    Math.max(1, Number(url.searchParams.get('limit')) || 200),
  );

  const db = supabaseAdmin();
  let query = db
    .from('audit_logs')
    .select(
      'id, avatar_id, avatar_name, session_id, actor, role, content, escalation, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (avatar) query = query.eq('avatar_id', avatar);
  if (q) query = query.ilike('content', `%${q}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ entries: data ?? [] });
}
