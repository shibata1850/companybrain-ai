import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { adminLiveModel } from '@/lib/planEnforce';
import { enforceRateLimit } from '@/lib/rateLimit';
import { mintLiveToken, sanitizeModelOverride } from '@/lib/liveToken';
import { clientIp, kioskConfig, kioskKeyMatches } from '@/lib/kioskAuth';
import { reportError } from '@/lib/errorReport';

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
