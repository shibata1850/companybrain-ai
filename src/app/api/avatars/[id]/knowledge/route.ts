import { NextRequest, NextResponse } from 'next/server';
import { authorizeAvatar } from '@/lib/authServer';
import { searchKnowledge } from '@/lib/retrieval';
import { reportError } from '@/lib/errorReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Function-calling endpoint hit by the browser whenever Gemini Live
 * decides it needs more context about a specific topic. Embeds the
 * query, runs the cosine-similarity search RPC, and returns the top
 * matching transcript chunks so the model can ground its answer.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authorizeAvatar(params.id);
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  const body = (await req.json().catch(() => ({}))) as { query?: string };
  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    // ハイブリッド検索(キーワード + 意味)。定型文の多い規程で、固有語を
    // 含むチャンクが意味検索だけでは上位に入らない事象への対応。
    const hits = await searchKnowledge(params.id, query, 8);
    return NextResponse.json({
      // モデルには素材名を添えて渡す。どの資料に基づくかを回答内で示せる。
      results: hits.map((h) =>
        h.materialName ? `【${h.materialName}】 ${h.content}` : h.content,
      ),
      // UI の「根拠」表示用。本文と引用元を分けて返す。
      hits: hits.map((h) => ({
        content: h.content,
        material_name: h.materialName ?? null,
        material_id: h.materialId ?? null,
      })),
    });
  } catch (e) {
    // 検索は質問のたびに通る中核経路。失敗が見えないと「answers が出ない」
    // という報告だけが残り原因を追えないため、必ず記録する。
    reportError(e, { route: 'POST /api/avatars/[id]/knowledge' });
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
