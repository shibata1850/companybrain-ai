import { NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Admin-only roster of every brain across all users, with owner,
 * material count, and last-activity, for the management page. Kept
 * lightweight (no signed cover URLs) so it stays fast with many brains.
 */

/**
 * `.in()` に渡す件数の上限。PostgREST はフィルタを URL クエリに載せるため、
 * UUID(36文字)を200件並べると約7.9KB になり、nginx/Kong の既定ヘッダ上限
 * 8KB をほぼ使い切る。超えると 414 で失敗するので、必ず分割して問い合わせる。
 */
const IN_CHUNK = 50;

/** 1リクエストで扱うブレイン数の上限(超過分は total で UI に明示する)。 */
const MAX_BRAINS = 1000;

/** PostgREST の1レスポンス行数上限に合わせたページサイズ。 */
const ROW_PAGE = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function GET() {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const db = supabaseAdmin();

  // ブレイン一覧。PostgREST の行上限(既定1000)で静かに欠落しないよう
  // 明示的にページングし、総件数も取得して UI に打ち切りを知らせる。
  const avatars: Array<Record<string, unknown>> = [];
  let totalCount = 0;
  for (let from = 0; from < MAX_BRAINS; from += ROW_PAGE) {
    const { data, error, count } = await db
      .from('avatars')
      .select('id, name, description, owner_email, created_at', {
        count: 'exact',
      })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }) // 同時刻の行でも順序を安定させる
      .range(from, Math.min(from + ROW_PAGE, MAX_BRAINS) - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (count != null) totalCount = count;
    if (!data || data.length === 0) break;
    avatars.push(...data);
    if (data.length < ROW_PAGE) break;
  }
  const avatarIds = avatars.map((a) => a.id as string);

  // 素材件数。以前はブレイン1件につき COUNT を1回ずつ逐次実行しており、
  // 300件で10秒を超えて管理画面が開けなくなっていた。avatar_id だけを
  // まとめて取り、JS で数える。エラーは握りつぶさず 500 で返す
  // (黙って「素材0件」と表示するほうが有害なため)。
  const counts = new Map<string, number>();
  for (const ids of chunk(avatarIds, IN_CHUNK)) {
    for (let from = 0; ; from += ROW_PAGE) {
      const { data, error } = await db
        .from('training_videos')
        .select('avatar_id')
        .in('avatar_id', ids)
        .order('id', { ascending: true }) // ページ間の重複・欠落を防ぐ
        .range(from, from + ROW_PAGE - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        const id = r.avatar_id as string;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      if (data.length < ROW_PAGE) break;
    }
  }

  // 最終活動。全体の直近N行から拾うと会話の活発な数ブレインで枠が埋まり
  // 他が null になるため、対象ブレインを分割して問い合わせる。
  const lastActivity = new Map<string, string>();
  for (const ids of chunk(avatarIds, IN_CHUNK)) {
    const { data, error } = await db
      .from('audit_logs')
      .select('avatar_id, created_at')
      .in('avatar_id', ids)
      .order('created_at', { ascending: false })
      .limit(ROW_PAGE);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const r of data ?? []) {
      const id = r.avatar_id as string | null;
      if (id && !lastActivity.has(id)) {
        lastActivity.set(id, r.created_at as string);
      }
    }
  }

  // Admin's labels for the owners (never their private display_name).
  // 表示対象の所有者だけに絞る(app_users 全件取得はユーザー増で欠落する)。
  const ownerEmails = Array.from(
    new Set(avatars.map((a) => a.owner_email as string).filter(Boolean)),
  );
  const labelByEmail = new Map<string, string | null>();
  for (const emails of chunk(ownerEmails, IN_CHUNK)) {
    const { data, error } = await db
      .from('app_users')
      .select('email, admin_label')
      .in('email', emails);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const l of data ?? []) {
      labelByEmail.set(l.email as string, (l.admin_label as string | null) ?? null);
    }
  }

  const rows = avatars.map((a) => ({
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
    total: totalCount || rows.length,
    limit: MAX_BRAINS,
  });
}
