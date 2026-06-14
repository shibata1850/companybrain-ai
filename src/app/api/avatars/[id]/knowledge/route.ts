import { NextRequest, NextResponse } from 'next/server';
import { authorizeAvatar } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';
import { embedTexts } from '@/lib/gemini';

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

  const db = supabaseAdmin();
  try {
    const [queryEmbedding] = await embedTexts([query]);
    const { data: matches, error } = await db.rpc('match_knowledge_chunks', {
      query_embedding: queryEmbedding,
      target_avatar_id: params.id,
      match_count: 6,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const results = (matches as Array<{ content: string }> | null) ?? [];
    return NextResponse.json({
      results: results.map((r) => r.content),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
