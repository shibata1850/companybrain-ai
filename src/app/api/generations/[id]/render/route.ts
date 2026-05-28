import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { generateVideo } from '@/lib/heygen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Approve a draft generation and submit it to HeyGen for video render.
 * This is the step that actually spends API credits.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const db = supabaseAdmin();
  const { data: gen } = await db
    .from('generations')
    .select('id, avatar_id, answer, status')
    .eq('id', params.id)
    .single();
  if (!gen) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (!gen.answer || gen.answer.trim().length === 0) {
    return NextResponse.json(
      { error: '回答テキストが空です。再生成してから動画化してください。' },
      { status: 400 },
    );
  }
  if (gen.status === 'rendering' || gen.status === 'ready') {
    return NextResponse.json(
      { error: 'すでに動画化が始まっているか完了しています' },
      { status: 400 },
    );
  }

  const { data: avatar } = await db
    .from('avatars')
    .select('heygen_photo_id, heygen_voice_id')
    .eq('id', gen.avatar_id)
    .single();
  if (!avatar?.heygen_photo_id || !avatar?.heygen_voice_id) {
    return NextResponse.json(
      { error: 'avatar is not fully trained yet (missing HeyGen ids)' },
      { status: 400 },
    );
  }

  await db
    .from('generations')
    .update({
      status: 'rendering',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  try {
    const { videoId } = await generateVideo({
      talkingPhotoId: avatar.heygen_photo_id,
      voiceId: avatar.heygen_voice_id,
      inputText: gen.answer,
    });

    await db
      .from('generations')
      .update({
        heygen_video_id: videoId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    revalidatePath(`/avatars/${gen.avatar_id}`);
    return NextResponse.json({ heygen_video_id: videoId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from('generations')
      .update({
        status: 'error',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
