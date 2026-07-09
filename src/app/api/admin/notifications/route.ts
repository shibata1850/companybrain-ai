import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin broadcasts an announcement to users. Target is either every
 * allowlisted user ('all') or a single email. We fan out one
 * notification row per recipient so read state is tracked per user.
 * Body: { title, body?, link?, target: 'all' | <email> }
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { title, body, link, target, mediaPath, mediaType } = (await req
    .json()
    .catch(() => ({}))) as {
    title?: string;
    body?: string;
    link?: string;
    target?: string;
    mediaPath?: string;
    mediaType?: string;
  };
  const cleanTitle = title?.trim();
  if (!cleanTitle) {
    return NextResponse.json({ error: 'タイトルを入力してください' }, { status: 400 });
  }
  if (!target) {
    return NextResponse.json({ error: '宛先を選択してください' }, { status: 400 });
  }
  // 添付は notification-media 署名APIが発行した notifications/ 配下の
  // パスのみ受け付ける(任意パスの参照を防ぐ)。type は image/video のみ。
  let cleanMediaPath: string | null = null;
  let cleanMediaType: string | null = null;
  if (typeof mediaPath === 'string' && mediaPath) {
    if (!mediaPath.startsWith('notifications/') || mediaPath.includes('..')) {
      return NextResponse.json({ error: 'invalid media path' }, { status: 400 });
    }
    if (mediaType !== 'image' && mediaType !== 'video') {
      return NextResponse.json({ error: 'invalid media type' }, { status: 400 });
    }
    cleanMediaPath = mediaPath;
    cleanMediaType = mediaType;
  }

  const db = supabaseAdmin();

  let recipients: string[] = [];
  if (target === 'all') {
    const { data } = await db.from('app_users').select('email');
    recipients = (data ?? []).map((u) => u.email as string);
  } else {
    const email = target.trim().toLowerCase();
    const { data } = await db
      .from('app_users')
      .select('email')
      .eq('email', email)
      .single();
    if (!data) {
      return NextResponse.json(
        { error: 'そのユーザーは登録されていません' },
        { status: 404 },
      );
    }
    recipients = [email];
  }
  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  // media 列(0024)は未適用の環境がありうるので、添付があるときだけ
  // 含める。添付なしの通常のお知らせは従来どおりの列で挿入され、
  // マイグレーション未適用でも壊れない。
  const media =
    cleanMediaPath && cleanMediaType
      ? { media_path: cleanMediaPath, media_type: cleanMediaType }
      : {};
  const rows = recipients.map((email) => ({
    recipient_email: email,
    kind: 'admin_message',
    title: cleanTitle.slice(0, 120),
    body: body?.trim()?.slice(0, 2000) || null,
    link: link?.trim()?.slice(0, 300) || null,
    ...media,
  }));
  const { error } = await db.from('notifications').insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sent: rows.length });
}
