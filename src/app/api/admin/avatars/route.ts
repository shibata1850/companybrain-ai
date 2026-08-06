import { NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only roster of every brain across all users, with owner,
 * material count, and last-activity, for the management page. Kept
 * lightweight (no signed cover URLs) so it stays fast with many brains.
 */
export async function GET() {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const db = supabaseAdmin();

  // 一覧は上限を設ける。全件取得はブレインが増えるとタイムアウトと
  // PostgREST の行上限(既定1000)による静かな欠落を招くため。
  // ただし「黙って切り捨てる」ことはせず、総件数を返して UI に明示させる。
  const PAGE = 200;
  const { data: avatars, error, count: totalCount } = await db
    .from('avatars')
    .select('id, name, description, owner_email, created_at', {
      count: 'exact',
    })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(0, PAGE - 1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const avatarIds = (avatars ?? []).map((a) => a.id as string);

  // 素材件数。以前はブレイン1件につき COUNT を1回ずつ逐次実行していて、
  // 300件で10秒を超えて管理画面が開けなくなっていた。対象ブレインの
  // training_videos の avatar_id だけを1クエリで取り、JS で数える。
  const counts = new Map<string, number>();
  if (avatarIds.length > 0) {
    const MATERIAL_PAGE = 1000;
    for (let from = 0; ; from += MATERIAL_PAGE) {
      const { data: rows, error: mErr } = await db
        .from('training_videos')
        .select('avatar_id')
        .in('avatar_id', avatarIds)
        .range(from, from + MATERIAL_PAGE - 1);
      if (mErr || !rows || rows.length === 0) break;
      for (const r of rows) {
        const id = r.avatar_id as string;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      if (rows.length < MATERIAL_PAGE) break;
    }
  }

  // 最終活動。全体の直近2000行から拾うと、会話の活発な数ブレインで枠が
  // 埋まり他が null になっていた。表示対象のブレインに絞って取得する。
  const lastActivity = new Map<string, string>();
  if (avatarIds.length > 0) {
    const { data: recent } = await db
      .from('audit_logs')
      .select('avatar_id, created_at')
      .in('avatar_id', avatarIds)
      .order('created_at', { ascending: false })
      .limit(5000);
    for (const r of recent ?? []) {
      const id = r.avatar_id as string | null;
      if (id && !lastActivity.has(id)) {
        lastActivity.set(id, r.created_at as string);
      }
    }
  }

  // Admin's labels for the owners (never their private display_name).
  // 表示対象の所有者だけに絞る(app_users 全件取得はユーザー増で欠落する)。
  const ownerEmails = Array.from(
    new Set((avatars ?? []).map((a) => a.owner_email as string).filter(Boolean)),
  );
  const labelByEmail = new Map<string, string | null>();
  if (ownerEmails.length > 0) {
    const { data: labels } = await db
      .from('app_users')
      .select('email, admin_label')
      .in('email', ownerEmails);
    for (const l of labels ?? []) {
      labelByEmail.set(l.email as string, (l.admin_label as string | null) ?? null);
    }
  }

  const rows = (avatars ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    owner_email: a.owner_email,
    owner_label: labelByEmail.get(a.owner_email as string) ?? null,
    created_at: a.created_at,
    material_count: counts.get(a.id as string) ?? 0,
    last_activity: lastActivity.get(a.id as string) ?? null,
  }));

  // total は削除済みを除く全ブレイン数。rows.length より大きい場合は
  // 表示が上限で打ち切られていることを UI 側で明示する。
  return NextResponse.json({
    avatars: rows,
    total: totalCount ?? rows.length,
    limit: PAGE,
  });
}
