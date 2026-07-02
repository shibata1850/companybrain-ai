import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errorReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * staged/ 領域の孤児ファイルを削除する定期クリーンアップ。
 *
 * 動画の直接アップロードは、いったん staged/ に置いてからブレイン
 * 作成時に本来の場所へ move する。作成を中断・失敗したときの実体は
 * staged/ に残り続けるため、ここで古いものを掃除する。
 *
 * 「古い」の基準は 24 時間。署名付きアップロードのトークン寿命は
 * 2 時間なので、24 時間残っている staged ファイルが今後使われる
 * ことはない。
 *
 * 起動経路:
 *   - Vercel Cron(vercel.json)からの GET。環境変数 CRON_SECRET を
 *     設定しておくと、Vercel が Authorization: Bearer <secret> を
 *     付けてくるので、それを検証する。
 *   - 管理者がログイン状態でブラウザから直接叩く手動実行も可。
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
  const bucket = storageBucket();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  let removed = 0;
  const errors: string[] = [];
  try {
    // 削除しながら先頭ページを読み直す方式。1回の実行での上限は
    // 10 ページ × 1000 件 = 1万件(通常はゴミが数件のオーダー)。
    for (let page = 0; page < 10; page++) {
      const { data: entries, error: listErr } = await db.storage
        .from(bucket)
        .list('staged', {
          limit: 1000,
          sortBy: { column: 'created_at', order: 'asc' },
        });
      if (listErr) {
        errors.push(`list: ${listErr.message}`);
        break;
      }
      const stale = (entries ?? []).filter(
        (e) => e.name && e.created_at && Date.parse(e.created_at) < cutoff,
      );
      if (stale.length === 0) break;

      const paths = stale.map((e) => `staged/${e.name}`);
      const { error: rmErr } = await db.storage.from(bucket).remove(paths);
      if (rmErr) {
        errors.push(`remove: ${rmErr.message}`);
        break;
      }
      removed += paths.length;
      // 1000件未満しか返ってこなかったなら、それが全部だった。
      if ((entries ?? []).length < 1000) break;
    }
  } catch (e) {
    reportError(e, { route: 'GET /api/cron/cleanup-staged' });
    errors.push(e instanceof Error ? e.message : String(e));
  }

  console.log(
    `[cleanup-staged] removed=${removed}${errors.length ? ` errors=${errors.join('; ')}` : ''}`,
  );
  return NextResponse.json({
    removed,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
