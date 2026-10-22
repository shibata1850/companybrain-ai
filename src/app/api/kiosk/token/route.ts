import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { adminLiveModel } from '@/lib/planEnforce';
import { enforceRateLimit } from '@/lib/rateLimit';
import { mintLiveToken, sanitizeModelOverride } from '@/lib/liveToken';
import { clientIp, kioskConfig, kioskKeyMatches } from '@/lib/kioskAuth';
import { reportError } from '@/lib/errorReport';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * キオスク用のトークン発行。ログイン不要の代わりに、アクセスキーと
 * 「環境変数で固定された1ブレイン」の組でのみ発行する。中身(システム
 * 指示・モデルフォールバック)は通常の通話と同じ lib/liveToken。
 */
export async function POST(req: NextRequest) {
  const cfg = kioskConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'kiosk is not configured' },
      { status: 503 },
    );
  }
  // 展示端末は1台想定。IP別+全体の二重バーストガード。
  const ip = clientIp(req);
  const limitedIp = enforceRateLimit(`kiosk-token:${ip}`, 10, 60_000);
  if (limitedIp) return limitedIp;
  const limitedAll = enforceRateLimit('kiosk-token:all', 30, 60_000);
  if (limitedAll) return limitedAll;

  const body = (await req.json().catch(() => ({}))) as {
    key?: string;
    model?: string;
  };
  if (!kioskKeyMatches(body.key, cfg.key)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 日次の音声上限(安全弁)。キオスクはプラン課金の外で動くため、
  // 張り付き利用でAPI費用が青天井になるのを防ぐ。既定120分/日、
  // env KIOSK_DAILY_VOICE_MINUTES で変更(0以下で無制限)。
  // 判定はセッション開始時のみ(進行中の会話は無音45秒の自動終了に任せる)。
  const dailyLimitMin = env.kioskDailyVoiceMinutes();
  if (dailyLimitMin > 0) {
    // 日本時間の「今日」の開始時刻。
    const JST_MS = 9 * 60 * 60 * 1000;
    const dayStartUtc = new Date(
      Math.floor((Date.now() + JST_MS) / 86_400_000) * 86_400_000 - JST_MS,
    );
    const db = supabaseAdmin();
    const { data: rows, error: usageErr } = await db
      .from('voice_sessions')
      .select('seconds')
      .eq('actor', 'kiosk')
      .gte('created_at', dayStartUtc.toISOString())
      .limit(2000);
    // 集計に失敗したときは安全側(発行拒否)ではなく通す: 展示が
    // DBの一時障害で黙って止まる方が被害が大きい。
    if (!usageErr) {
      const usedSec = (rows ?? []).reduce(
        (sum, r) => sum + (Number(r.seconds) || 0),
        0,
      );
      if (usedSec >= dailyLimitMin * 60) {
        return NextResponse.json(
          {
            error:
              '本日の音声会話の受付は終了しました。また明日お話しください。',
          },
          { status: 429 },
        );
      }
    }
  }

  try {
    const minted = await mintLiveToken(cfg.avatarId, {
      modelOverride: sanitizeModelOverride(body.model),
      // 会社所有の展示なので最上位(管理者と同じ解決)。
      baseModel: adminLiveModel(env.geminiLiveModel()),
    });
    return NextResponse.json({
      token: minted.token,
      model: minted.model,
      voice: minted.voice,
      voiceEnabled: true,
      avatar: minted.avatar,
    });
  } catch (e) {
    reportError(e, { route: 'POST /api/kiosk/token', actor: 'kiosk' });
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Gemini token failed: ${message}` },
      { status: 500 },
    );
  }
}
