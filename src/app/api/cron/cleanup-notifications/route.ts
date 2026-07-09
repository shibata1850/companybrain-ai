import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errorReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// リテンション: 既読は90日、未読含め全体は365日で自動削除する。
const READ_TTL_DAYS = 90;
const HARD_TTL_DAYS = 365;

/**
 * 古いお知らせを自動削除する定期クリーンアップ。放置すると
 * notifications 行が受信者×お知らせ数で無限に増えるため、
 *   - 既読で READ_TTL_DAYS(90日)より古いもの
 *   - 既読/未読を問わず HARD_TTL_DAYS(365日)より古いもの
 * を削除する。添付ファイル(Storage の notifications/ 配下)は、
 * どの notifications 行からも参照されなくなったものだけ後段で掃除する。
 *
 * 認可は cleanup-staged と同じ: Vercel Cron の Bearer CRON_SECRET、
 * または管理者のログイン。
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  let authorized = Boolean(secret && header === `Bearer ${secret}`);
  if (!authorized) {
    const me = await getAppUser();
    authorized = me?.role === 'admin';
  }
  if (!authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = Date.now();
  const readCutoff = new Date(
    now - READ_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const hardCutoff = new Date(
    now - HARD_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  let removed = 0;
  const errors: string[] = [];
  try {
    // 1) 既読で90日より古い
    {
      const { data, error } = await db
        .from('notifications')
        .delete()
        .not('read_at', 'is', null)
        .lt('created_at', readCutoff)
        .select('id');
      if (error) errors.push(`read: ${error.message}`);
      else removed += data?.length ?? 0;
    }
    // 2) 未読含め365日より古い
    {
      const { data, error } = await db
        .from('notifications')
        .delete()
        .lt('created_at', hardCutoff)
        .select('id');
      if (error) errors.push(`hard: ${error.message}`);
      else removed += data?.length ?? 0;
    }

    // 3) どの行からも参照されなくなった添付を Storage から掃除する。
    //    まだ参照している media_path を集め、それ以外の古い
    //    notifications/ オブジェクトを削除する。
    try {
      const { data: refs } = await db
        .from('notifications')
        .select('media_path')
        .not('media_path', 'is', null)
        .limit(10000);
      const referenced = new Set(
        (refs ?? [])
          .map((r) => (r as { media_path?: string }).media_path)
          .filter(Boolean) as string[],
      );
      const { data: files } = await db.storage
        .from(storageBucket())
        .list('notifications', { limit: 1000 });
      const orphans = (files ?? [])
        .filter((f) => f.name)
        .map((f) => `notifications/${f.name}`)
        .filter((p) => !referenced.has(p));
      if (orphans.length > 0) {
        await db.storage.from(storageBucket()).remove(orphans);
      }
    } catch (mediaErr) {
      // 添付掃除の失敗は本処理を止めない(media 列未適用の環境含む)。
      console.warn(
        '[cleanup-notifications] media sweep skipped:',
        mediaErr instanceof Error ? mediaErr.message : String(mediaErr),
      );
    }
  } catch (e) {
    reportError(e, { route: 'GET /api/cron/cleanup-notifications' });
    errors.push(e instanceof Error ? e.message : String(e));
  }

  console.log(
    `[cleanup-notifications] removed=${removed}${errors.length ? ` errors=${errors.join('; ')}` : ''}`,
  );
  return NextResponse.json({
    removed,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
