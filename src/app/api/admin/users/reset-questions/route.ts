import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 管理者が対象ユーザーの「今月の質問回数」を手動リセットする。
 * 監査ログは消さず、集計の起点(questions_reset_at)を現在時刻に
 * 進めることで、以後この時刻以降の質問だけが上限に数えられる。
 * Body: { email }
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from('app_users')
    .update({ questions_reset_at: new Date().toISOString() })
    .eq('email', cleanEmail);
  if (error) {
    // 列が無い(0025 未適用)場合はその旨を返す。
    return NextResponse.json(
      {
        error: /questions_reset_at|column/.test(error.message)
          ? 'データベース更新(0025)が未適用のため、リセットできません。'
          : error.message,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
