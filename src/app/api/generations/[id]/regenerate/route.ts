import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { answerAsPersona, embedTexts, type AnswerLength } from '@/lib/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Re-run Gemini on an existing draft generation with a (possibly
 * different) length, and overwrite the draft's answer text. Only allowed
 * while the generation is still a draft or has errored — once it has
 * been sent to HeyGen we don't let the text drift out of sync.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = (await req.json().catch(() => ({}))) as {
    length?: AnswerLength;
  };
  const length: AnswerLength = body.length ?? 'standard';

  const db = supabaseAdmin();
  const { data: gen } = await db
    .from('generations')
    .select('id, avatar_id, question, status')
    .eq('id', params.id)
    .single();
  if (!gen) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (gen.status === 'rendering' || gen.status === 'ready') {
    return NextResponse.json(
      { error: 'cannot regenerate a generation that is already rendering or ready' },
      { status: 400 },
    );
  }

  const { data: avatar } = await db
    .from('avatars')
    .select('name')
    .eq('id', gen.avatar_id)
    .single();
  if (!avatar) {
    return NextResponse.json({ error: 'avatar not found' }, { status: 404 });
  }

  try {
    const [queryEmbedding] = await embedTexts([gen.question]);
    const { data: matches } = await db.rpc('match_knowledge_chunks', {
      query_embedding: queryEmbedding,
      target_avatar_id: gen.avatar_id,
      match_count: 6,
    });
    const knowledge =
      (matches as Array<{ content: string }> | null)?.map((m) => m.content) ??
      [];

    const answer = await answerAsPersona({
      personaName: avatar.name,
      question: gen.question,
      knowledge,
      length,
    });

    await db
      .from('generations')
      .update({
        answer,
        status: 'draft',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    revalidatePath(`/avatars/${gen.avatar_id}`);
    return NextResponse.json({ answer, length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
