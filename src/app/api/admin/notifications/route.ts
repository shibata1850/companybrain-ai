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
  // 運営者(全ユーザーへ)または会社管理者(自社メンバーのみへ)が作成可。
  const isSuperAdmin = me?.role === 'admin';
  const isCompanyAdmin = !!me?.org_id && me?.org_role === 'company_admin';
  if (!me || (!isSuperAdmin && !isCompanyAdmin)) {
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

  // 会社管理者は自社メンバーのみが対象。運営者は全ユーザーが対象。
  let recipients: string[] = [];
  if (target === 'all') {
    let q = db.from('app_users').select('email');
    if (!isSuperAdmin) q = q.eq('org_id', me.org_id!);
    const { data } = await q;
    recipients = (data ?? []).map((u) => u.email as string);
  } else {
    const email = target.trim().toLowerCase();
    let q = db.from('app_users').select('email, org_id').eq('email', email);
    const { data } = await q.single();
    if (!data) {
      return NextResponse.json(
        { error: 'そのユーザーは登録されていません' },
        { status: 404 },
      );
    }
    // 会社管理者は自社メンバー以外には送れない。
    if (!isSuperAdmin && (data as { org_id?: string }).org_id !== me.org_id) {
      return NextResponse.json(
        { error: '自社のメンバーにのみお知らせを送れます。' },
        { status: 403 },
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
