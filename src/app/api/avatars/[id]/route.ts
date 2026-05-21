import { NextRequest, NextResponse } from 'next/server';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const db = supabaseAdmin();
  const { data: avatar, error } = await db
    .from('avatars')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error || !avatar) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { data: videos } = await db
    .from('training_videos')
    .select('id, file_name, status, summary, created_at')
    .eq('avatar_id', params.id)
    .order('created_at', { ascending: false });

  const { data: generations } = await db
    .from('generations')
    .select(
      'id, question, answer, status, video_url, thumbnail_url, error_message, created_at',
    )
    .eq('avatar_id', params.id)
    .order('created_at', { ascending: false })
    .limit(20);

  // Sign a URL for the cover image so the client can display it.
  let coverUrl: string | null = null;
  if (avatar.cover_image_path) {
    const { data: signed } = await db.storage
      .from(storageBucket())
      .createSignedUrl(avatar.cover_image_path, 60 * 60);
    coverUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    avatar: { ...avatar, cover_url: coverUrl },
    training_videos: videos ?? [],
    generations: generations ?? [],
  });
}
