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
      // 参照中の media_path は「必ず全件」集める。以前は 10,000 件で
      // 打ち切っていたため、それを超えると使用中の添付を孤児と誤判定して
      // Storage から削除していた(データ損失)。
      // 全件を集めきれない場合は削除自体を行わない(安全側に倒す)。
      const REF_PAGE = 1000;
      const REF_HARD_CAP = 100_000; // これを超えたら判定を諦める
      const referenced = new Set<string>();
      let complete = false;
      for (let from = 0; from < REF_HARD_CAP; from += REF_PAGE) {
        const { data: refs, error: refErr } = await db
          .from('notifications')
          .select('media_path')
          .not('media_path', 'is', null)
          .order('id', { ascending: true })
          .range(from, from + REF_PAGE - 1);
        if (refErr) throw refErr;
        for (const r of refs ?? []) {
          const p = (r as { media_path?: string }).media_path;
          if (p) referenced.add(p);
        }
        if (!refs || refs.length < REF_PAGE) {
          complete = true;
          break;
        }
      }
      if (!complete) {
        // 参照一覧を取り切れていない状態で削除すると使用中の添付を消す。
        console.warn(
          '[cleanup-notifications] media sweep skipped: referenced set incomplete',
        );
      } else {
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
