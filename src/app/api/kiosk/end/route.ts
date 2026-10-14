import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { clientIp, kioskConfig, kioskKeyMatches } from '@/lib/kioskAuth';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * キオスク会話の音声秒数の記録(費用の把握用)。actor は「kiosk」固定
 * なので、どのユーザーのプラン残量にも影響しない。
 */
export async function POST(req: NextRequest) {
  const cfg = kioskConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'kiosk is not configured' },
      { status: 503 },
    );
  }
  const limited = enforceRateLimit(`kiosk-end:${clientIp(req)}`, 30, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as {
    key?: string;
    seconds?: number;
  };
  if (!kioskKeyMatches(body.key, cfg.key)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const seconds = Math.min(7200, Math.max(0, Math.round(Number(body.seconds) || 0)));
  if (seconds === 0) return NextResponse.json({ ok: true });

  const db = supabaseAdmin();
  const { error } = await db.from('voice_sessions').insert({
    actor: 'kiosk',
    avatar_id: cfg.avatarId,
    seconds,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
