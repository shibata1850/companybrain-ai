import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { extractFrameAndAudio } from '@/lib/media';
import { uploadImage as didUploadImage } from '@/lib/did';
import { env } from '@/lib/env';
import { processTrainingVideo } from '@/lib/processing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('avatars')
    .select('id, name, description, cover_image_path, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const bucket = storageBucket();
  const avatars = await Promise.all(
    (data ?? []).map(async (a) => {
      let cover_url: string | null = null;
      if (a.cover_image_path) {
        const { data: s } = await db.storage
          .from(bucket)
          .createSignedUrl(a.cover_image_path, 60 * 60);
        cover_url = s?.signedUrl ?? null;
      }
      return { ...a, cover_url };
    }),
  );
  return NextResponse.json({ avatars });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('video');
  const name = (form.get('name') as string | null)?.trim() || '名称未設定';
  const description = (form.get('description') as string | null) || null;

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'video file is required' },
      { status: 400 },
    );
  }

  const videoBytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'video/mp4';
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
  const db = supabaseAdmin();
  const bucket = storageBucket();

  // 1. Insert avatar row up-front so we have an id to attribute work to.
  const { data: avatar, error: avatarErr } = await db
    .from('avatars')
    .insert({ name, description })
    .select('id')
    .single();
  if (avatarErr || !avatar) {
    return NextResponse.json(
      { error: avatarErr?.message || 'insert failed' },
      { status: 500 },
    );
  }
  const avatarId = avatar.id as string;

  // 2. Upload source video to Supabase Storage.
  const storagePath = `${avatarId}/${randomUUID()}.${ext}`;
  const { error: upErr } = await db.storage
    .from(bucket)
    .upload(storagePath, videoBytes, { contentType: mimeType, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // 3. Record training video row (status=pending).
  const { data: tv, error: tvErr } = await db
    .from('training_videos')
    .insert({
      avatar_id: avatarId,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: mimeType,
      status: 'pending',
    })
    .select('id')
    .single();
  if (tvErr || !tv) {
    return NextResponse.json(
      { error: tvErr?.message || 'training video insert failed' },
      { status: 500 },
    );
  }
  const videoId = tv.id as string;

  // 4. Extract one frame from the video to serve as the face image.
  //    Audio is also extracted but unused for now (D-ID's default flow
  //    uses Microsoft TTS rather than cloning the user's voice).
  let frame: Buffer;
  try {
    const out = await extractFrameAndAudio(videoBytes, ext);
    frame = out.frame;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `ffmpeg extraction failed: ${message}` },
      { status: 500 },
    );
  }

  // 5. Save cover image to Supabase storage so the UI can show it.
  const coverPath = `${avatarId}/cover.jpg`;
  await db.storage
    .from(bucket)
    .upload(coverPath, frame, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  // 6. Upload the face image to D-ID. The returned URL is what /talks
  //    accepts as `source_url`.
  let sourceUrl: string;
  try {
    const up = await didUploadImage(frame, 'image/jpeg');
    sourceUrl = up.url;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `D-ID image upload failed: ${message}` },
      { status: 500 },
    );
  }

  // For D-ID we reuse the existing columns to avoid a migration:
  //   heygen_photo_id -> D-ID source image URL
  //   heygen_voice_id -> Microsoft Azure voice id (e.g. ja-JP-NanamiNeural)
  const voiceId = env.didVoiceId();
  await db
    .from('avatars')
    .update({
      heygen_photo_id: sourceUrl,
      heygen_voice_id: voiceId,
      cover_image_path: coverPath,
    })
    .eq('id', avatarId);

  // 7. Transcribe + chunk + embed for the knowledge base.
  try {
    await processTrainingVideo({
      avatarId,
      videoId,
      videoBytes,
      mimeType,
    });
  } catch {
    // status is already 'error' on the training_videos row; avatar still exists.
  }

  // Invalidate the home page's router cache so the just-created brain
  // shows up immediately when the user navigates back to the list.
  revalidatePath('/');

  return NextResponse.json({ id: avatarId });
}
