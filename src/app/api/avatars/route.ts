import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { extractFrameAndAudio } from '@/lib/media';
import {
  cloneVoice,
  createTalkingPhoto,
  uploadAsset,
} from '@/lib/heygen';
import { processTrainingVideo } from '@/lib/processing';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('avatars')
    .select('id, name, description, cover_image_path, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ avatars: data ?? [] });
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

  // 4. Extract one frame + audio so we can build the HeyGen avatar+voice.
  let frame: Buffer;
  let audio: Buffer;
  try {
    const out = await extractFrameAndAudio(videoBytes, ext);
    frame = out.frame;
    audio = out.audio;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `ffmpeg extraction failed: ${message}` },
      { status: 500 },
    );
  }

  // 5. Save cover image to storage so the UI can show it.
  const coverPath = `${avatarId}/cover.jpg`;
  await db.storage
    .from(bucket)
    .upload(coverPath, frame, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  // 6. Send frame + audio to HeyGen to create avatar + cloned voice.
  let talkingPhotoId: string;
  let voiceId: string;
  try {
    const frameUp = await uploadAsset(frame, 'image/jpeg');
    const audioUp = await uploadAsset(audio, 'audio/mpeg');
    const tp = await createTalkingPhoto(frameUp.key);
    talkingPhotoId = tp.talkingPhotoId;
    const vc = await cloneVoice({ audioKey: audioUp.key, name });
    voiceId = vc.voiceId;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `HeyGen setup failed: ${message}` },
      { status: 500 },
    );
  }

  await db
    .from('avatars')
    .update({
      heygen_photo_id: talkingPhotoId,
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

  return NextResponse.json({ id: avatarId });
}
