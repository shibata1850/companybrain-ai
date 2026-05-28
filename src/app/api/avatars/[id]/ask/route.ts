import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { answerAsPersona, embedTexts, type AnswerLength } from '@/lib/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Generate a draft answer (Gemini only — no HeyGen render yet). The user
 * then reviews / edits / regenerates the draft and explicitly clicks
 * "動画にする" to spend HeyGen credits.
 *
 * Body: { question: string, length?: 'short' | 'standard' | 'detailed' }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const avatarId = params.id;
  const body = (await req.json()) as {
    question?: string;
    length?: AnswerLength;
  };
  const question = body.question?.trim();
  const length: AnswerLength = body.length ?? 'standard';
  if (!question) {
    return NextResponse.json(
      { error: 'question is required' },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const { data: avatar } = await db
    .from('avatars')
    .select('id, name')
    .eq('id', avatarId)
    .single();
  if (!avatar) {
    return NextResponse.json({ error: 'avatar not found' }, { status: 404 });
  }

  // Persist a draft row up-front so the client can show it even if the
  // Gemini call fails.
  const { data: gen, error: genErr } = await db
    .from('generations')
    .insert({ avatar_id: avatarId, question, status: 'draft' })
    .select('id')
    .single();
  if (genErr || !gen) {
    return NextResponse.json(
      { error: genErr?.message || 'insert failed' },
      { status: 500 },
    );
  }
  const generationId = gen.id as string;

  try {
    const [queryEmbedding] = await embedTexts([question]);
    const { data: matches } = await db.rpc('match_knowledge_chunks', {
      query_embedding: queryEmbedding,
      target_avatar_id: avatarId,
      match_count: 6,
    });
    const knowledge =
      (matches as Array<{ content: string }> | null)?.map((m) => m.content) ??
      [];

    const answer = await answerAsPersona({
      personaName: avatar.name,
      question,
      knowledge,
      length,
    });

    await db
      .from('generations')
      .update({
        answer,
        status: 'draft',
        updated_at: new Date().toISOString(),
      })
      .eq('id', generationId);

    revalidatePath(`/avatars/${avatarId}`);
    return NextResponse.json({ id: generationId, answer, length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from('generations')
      .update({
        status: 'error',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', generationId);
    return NextResponse.json(
      { error: message, id: generationId },
      { status: 500 },
    );
  }
}
