import { NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';
import { kioskConfig } from '@/lib/kioskAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 展示モード(/admin/kiosk)用: キオスクの設定状況を返す。管理者専用。
 *
 * アクセスキーはサーバー環境変数にしか無く、展示用URLを組み立てるには
 * 管理者がキーを知る必要があるため、ここでだけ返す(発行者=管理者
 * 本人なので新たな漏えい面は増えない。キーが漏れた場合は環境変数の
 * 差し替えで即失効できる)。
 */
export async function GET() {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const cfg = kioskConfig();
  if (!cfg) {
    return NextResponse.json({ configured: false, avatar: null });
  }

  // 本番で映るブレイン名(設定の取り違えに気づけるように表示する)。
  const db = supabaseAdmin();
  const { data: avatar } = await db
    .from('avatars')
    .select('id, name')
    .eq('id', cfg.avatarId)
    .is('deleted_at', null)
    .single();

  return NextResponse.json({
    configured: true,
    key: cfg.key,
    avatar: avatar ? { id: avatar.id, name: avatar.name } : null,
  });
}
