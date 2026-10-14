import { NextRequest, NextResponse } from 'next/server';
import { searchKnowledge } from '@/lib/retrieval';
import { clientIp, kioskConfig, kioskKeyMatches } from '@/lib/kioskAuth';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * キオスク会話中の search_knowledge ツール呼び出し先。検索対象は
 * 環境変数で固定された1ブレインのみ。応答形式は通常の
 * /api/avatars/[id]/knowledge と同一(クライアントの処理を共通にするため)。
 */
export async function POST(req: NextRequest) {
  const cfg = kioskConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'kiosk is not configured' },
      { status: 503 },
    );
  }
  const limited = enforceRateLimit(
    `kiosk-knowledge:${clientIp(req)}`,
    60,
    60_000,
  );
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as {
    key?: string;
    query?: string;
  };
  if (!kioskKeyMatches(body.key, cfg.key)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    const hits = await searchKnowledge(cfg.avatarId, query, 8);
    return NextResponse.json({
      results: hits.map((h) =>
        h.materialName ? `【${h.materialName}】 ${h.content}` : h.content,
      ),
      hits: hits.map((h) => ({
        content: h.content,
        material_name: h.materialName ?? null,
        material_id: h.materialId ?? null,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
