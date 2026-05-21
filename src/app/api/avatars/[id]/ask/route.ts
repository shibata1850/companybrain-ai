import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { answerAsPersona, embedTexts } from '@/lib/gemini';
import { generateVideo } from '@/lib/heygen';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Ask the avatar a question. Synchronously runs Gemini to produce the
 * answer text, kicks off a HeyGen render, and persists a `generations`
 * row that the client can then poll via /api/generations/[id].
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const avatarId = params.id;
  const body = (await req.json()) as { question?: string };
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json(
      { error: 'question is required' },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const { data: avatar } = await db
    .from('avatars')
    .select('id, name, heygen_photo_id, heygen_voice_id')
    .eq('id', avatarId)
    .single();
  if (!avatar) {
    return NextResponse.json({ error: 'avatar not found' }, { status: 404 });
  }
  if (!avatar.heygen_photo_id || !avatar.heygen_voice_id) {
    return NextResponse.json(
      { error: 'avatar is not fully trained yet (missing HeyGen ids)' },
      { status: 400 },
    );
  }

  // Insert generation row right away so the client can find it even if
  // later steps fail.
  const { data: gen, error: genErr } = await db
    .from('generations')
    .insert({ avatar_id: avatarId, question, status: 'answering' })
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
    // Retrieve relevant past utterances via pgvector.
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
    });

    await db
      .from('generations')
      .update({ answer, status: 'rendering', updated_at: new Date().toISOString() })
      .eq('id', generationId);

    const { videoId } = await generateVideo({
      talkingPhotoId: avatar.heygen_photo_id,
      voiceId: avatar.heygen_voice_id,
      inputText: answer,
    });

    await db
      .from('generations')
      .update({
        heygen_video_id: videoId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', generationId);

    return NextResponse.json({ id: generationId, answer, heygen_video_id: videoId });
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
