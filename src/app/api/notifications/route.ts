import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET lists the caller's notifications. Returns unread count too so
 * the header bell can show a badge in one round-trip.
 *   ?unread=1  return only unread
 */
export async function GET(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get('unread') === '1';

  const db = supabaseAdmin();
  let query = db
    .from('notifications')
    .select('id, kind, title, body, link, read_at, created_at')
    .eq('recipient_email', me.email)
    .order('created_at', { ascending: false })
    .limit(100);
  if (unreadOnly) query = query.is('read_at', null);
  const { data } = await query;

  const { count } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_email', me.email)
    .is('read_at', null);

  return NextResponse.json({
    notifications: data ?? [],
    unread_count: count ?? 0,
  });
}

/**
 * POST { action: 'read_all' | 'read', id? } — mark all (or one) read.
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { action, id } = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
  };
  const db = supabaseAdmin();
  if (action === 'read' && id) {
    await db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('recipient_email', me.email);
  } else if (action === 'read_all') {
    await db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_email', me.email)
      .is('read_at', null);
  } else {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
