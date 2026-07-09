import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';

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
  const cols =
    'id, kind, title, body, link, read_at, created_at, media_path, media_type';
  const legacyCols = 'id, kind, title, body, link, read_at, created_at';
  const run = (select: string) => {
    let q = db
      .from('notifications')
      .select(select)
      .eq('recipient_email', me.email)
      .order('created_at', { ascending: false })
      .limit(100);
    if (unreadOnly) q = q.is('read_at', null);
    return q;
  };
  // media 列(0024)が未適用の環境では従来列で取り直す。
  const first = await run(cols);
  const result = first.error ? await run(legacyCols) : first;
  const rows = (result.data ?? []) as unknown as Array<
    Record<string, unknown>
  >;

  // 添付は非公開バケットにあるので、表示用に短命の署名URLを都度発行。
  const bucket = storageBucket();
  const notifications = await Promise.all(
    rows.map(async (n) => {
      let media_url: string | null = null;
      const path = n.media_path as string | null | undefined;
      if (path) {
        const { data: s } = await db.storage
          .from(bucket)
          .createSignedUrl(path, 60 * 60);
        media_url = s?.signedUrl ?? null;
      }
      const { media_path, ...rest } = n;
      return { ...rest, media_url };
    }),
  );

  const { count } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_email', me.email)
    .is('read_at', null);

  return NextResponse.json({
    notifications,
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
