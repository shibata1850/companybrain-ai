import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getAppUser } from '@/lib/authServer';
import { adminLiveModel } from '@/lib/planEnforce';
import { KNOWN_LIVE_MODELS, probeLiveModel } from '@/lib/liveToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * リアルタイム会話モデルの死活確認(管理者専用)。
 *
 * Gemini のモデルは予告付きで提供終了する(2026-10-16 の 2.5 系など)。
 * 展示や商談の直前に「いま使うモデルとフォールバックが生きているか」を
 * ワンクリックで点検できるようにする。実際の通話と同じトークン発行
 * 経路で確認するため、ここが全滅していれば音声会話も全滅している。
 */
export async function GET() {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 点検対象: 環境変数の既定モデル(管理者・キオスクが使う解決値)+
  // 既知のフォールバック。重複は除く。
  const models = Array.from(
    new Set([
      adminLiveModel(env.geminiLiveModel()),
      env.geminiLiveModel(),
      ...KNOWN_LIVE_MODELS,
    ]),
  );

  const results = await Promise.all(models.map((m) => probeLiveModel(m)));
  return NextResponse.json({ results, checked_at: new Date().toISOString() });
}
