import { NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 未読件数だけを返す軽量エンドポイント(下部ナビ/ヘッダーのバッジ用)。
 *
 * 以前はバッジ表示のために `/api/notifications` を叩いていたが、これは
 * 通知本文を最大100件返し、そのうえ添付付き通知1件ごとに Storage の
 * 署名URLを発行する。全ログインユーザーが60秒ごとにポーリングするため、
 * 同時50人・添付100件で毎分5,000回の署名URL発行になっていた。
 * バッジに必要なのは件数だけなので、COUNT 1本に絞る。
 */
export async function GET() {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { count, error } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_email', me.email)
    .is('read_at', null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ unread_count: count ?? 0 });
}
