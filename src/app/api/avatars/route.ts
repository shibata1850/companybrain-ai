import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { extractFrameAndAudio } from '@/lib/media';
import { processTrainingVideo } from '@/lib/processing';
import { chunkTranscript, embedTexts } from '@/lib/gemini';
import { getAppUser } from '@/lib/authServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import {
  canAddMaterial,
  canCreateBrain,
  getMaterialBytesUsed,
  getPlanUsage,
  planLimitResponse,
} from '@/lib/planEnforce';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

/**
 * GET lists brains. A normal user sees only the brains they own; an
 * admin sees their own by default, or everyone's with ?scope=all
 * (used by the admin management page).
 */
export async function GET() {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Everyone — including admins — sees only their own brains here. A
  // brain is private to its creator; admin oversight is the audit log.
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('avatars')
    .select('id, name, description, cover_image_path, owner_email, created_at, request_id, sort_order')
    .is('deleted_at', null)
    .eq('owner_email', me.email)
    .order('sort_order', { ascending: false })
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
      const { request_id, ...rest } = a;
      return { ...rest, cover_url, from_request: request_id != null };
    }),
  );
  return NextResponse.json({ avatars });
}

export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Burst guard: brain creation runs ffmpeg + Gemini transcription, so
  // cap how fast one account can fire it.
  const limited = enforceRateLimit(`avatar-create:${me.email}`, 8, 60_000);
  if (limited) return limited;
  // Plan enforcement: members only. Admins have no plan / no caps.
  if (me.role !== 'admin') {
    const usage = await getPlanUsage(me);
    if (!canCreateBrain(usage)) {
      return NextResponse.json(planLimitResponse('brains', usage), {
        status: 403,
      });
    }
  }
  const form = await req.formData();
  const file = form.get('video');
  const name = (form.get('name') as string | null)?.trim() || '名称未設定';
  const description = (form.get('description') as string | null) || null;

  // Lightweight path: no video. The brain is seeded from an optional
  // icon photo + optional pasted text instead of a talking-head clip.
  if (!(file instanceof File)) {
    return createBrainFromTextAndPhoto({
      form,
      name,
      description,
      ownerEmail: me.email,
    });
  }

  const videoBytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'video/mp4';
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
  const db = supabaseAdmin();
  const bucket = storageBucket();

  // Plan enforcement: material size.
  if (me.role !== 'admin') {
    const usage = await getPlanUsage(me);
    const existing = await getMaterialBytesUsed(me);
    if (!canAddMaterial(usage.plan, existing, videoBytes.length)) {
      return NextResponse.json(planLimitResponse('materials', usage), {
        status: 403,
      });
    }
  }

  // 1. Insert avatar row up-front so we have an id to attribute work to.
  const { data: avatar, error: avatarErr } = await db
    .from('avatars')
    .insert({ name, description, owner_email: me.email })
    .select('id')
    .single();
  if (avatarErr || !avatar) {
    return NextResponse.json(
      { error: avatarErr?.message || 'insert failed' },
      { status: 500 },
    );
  }
  const avatarId = avatar.id as string;

  // If a later step fails, remove the just-created avatar so it doesn't
  // linger as an orphan (which would also consume the plan's brain cap).
  const rollback = async (message: string, status = 500) => {
    try {
      await db.storage.from(bucket).remove([`${avatarId}/`]);
    } catch {
      // best effort
    }
    await db.from('avatars').delete().eq('id', avatarId);
    return NextResponse.json({ error: message }, { status });
  };

  // 2. Upload source video to Supabase Storage.
  const storagePath = `${avatarId}/${randomUUID()}.${ext}`;
  const { error: upErr } = await db.storage
    .from(bucket)
    .upload(storagePath, videoBytes, { contentType: mimeType, upsert: false });
  if (upErr) {
    return rollback(upErr.message);
  }

  // 3. Record training video row (status=pending).
  const { data: tv, error: tvErr } = await db
    .from('training_videos')
    .insert({
      avatar_id: avatarId,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: mimeType,
      size_bytes: videoBytes.length,
      status: 'pending',
    })
    .select('id')
    .single();
  if (tvErr || !tv) {
    return rollback(tvErr?.message || 'training video insert failed');
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
    return rollback(`ffmpeg extraction failed: ${message}`);
  }

  // 5. Save cover image to Supabase storage so the UI can show it.
  const coverPath = `${avatarId}/cover.jpg`;
  await db.storage
    .from(bucket)
    .upload(coverPath, frame, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  // 6. We're using HeyGen's stock Interactive Avatar for streaming, so
  //    there's no per-brain Photo Avatar to register. The face we
  //    extracted is kept as the cover image for the UI; the actual
  //    streaming avatar is configured globally via env.
  await db
    .from('avatars')
    .update({
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

/**
 * Create a brain without a source video. The caller may provide:
 *   - photo: an image File used directly as the cover/icon.
 *   - text:  pasted knowledge that gets chunked + embedded so the brain
 *            can answer from it immediately.
 * Both are optional; a brain can be created with just a name and filled
 * in later from its detail page.
 */
async function createBrainFromTextAndPhoto({
  form,
  name,
  description,
  ownerEmail,
}: {
  form: FormData;
  name: string;
  description: string | null;
  ownerEmail: string;
}) {
  const db = supabaseAdmin();
  const bucket = storageBucket();

  const { data: avatar, error: avatarErr } = await db
    .from('avatars')
    .insert({ name, description, owner_email: ownerEmail })
    .select('id')
    .single();
  if (avatarErr || !avatar) {
    return NextResponse.json(
      { error: avatarErr?.message || 'insert failed' },
      { status: 500 },
    );
  }
  const avatarId = avatar.id as string;

  // Optional icon photo → cover image.
  const photo = form.get('photo');
  if (photo instanceof File && photo.size > 0) {
    const bytes = Buffer.from(await photo.arrayBuffer());
    const contentType = photo.type || 'image/jpeg';
    const coverPath = `${avatarId}/cover.jpg`;
    const { error: upErr } = await db.storage
      .from(bucket)
      .upload(coverPath, bytes, { contentType, upsert: true });
    if (!upErr) {
      await db
        .from('avatars')
        .update({ cover_image_path: coverPath })
        .eq('id', avatarId);
    }
  }

  // Optional seed text → knowledge base.
  const text = (form.get('text') as string | null)?.trim();
  if (text) {
    const folderRaw = form.get('folder');
    const folder =
      typeof folderRaw === 'string' && folderRaw.trim()
        ? folderRaw.trim()
        : null;
    try {
      await seedTextKnowledge(db, avatarId, text, folder);
    } catch {
      // The brain still exists; the failed training row carries the error.
    }
  }

  revalidatePath('/');
  return NextResponse.json({ id: avatarId });
}

/**
 * Insert a text training entry and its embedded chunks. Mirrors the
 * /api/avatars/[id]/train-text flow so a brain can be seeded at creation.
 */
async function seedTextKnowledge(
  db: SupabaseClient,
  avatarId: string,
  text: string,
  folder: string | null,
) {
  const { data: tv } = await db
    .from('training_videos')
    .insert({
      avatar_id: avatarId,
      storage_path: null,
      file_name: 'テキスト学習',
      mime_type: 'text/plain',
      source_type: 'text',
      folder,
      status: 'processing',
    })
    .select('id')
    .single();
  const videoId = tv?.id as string | undefined;
  if (!videoId) return;

  try {
    const chunks = chunkTranscript(text);
    const embeddings = chunks.length > 0 ? await embedTexts(chunks) : [];
    if (chunks.length > 0) {
      const rows = chunks.map((content, i) => ({
        avatar_id: avatarId,
        video_id: videoId,
        content,
        embedding: embeddings[i],
      }));
      const { error } = await db.from('knowledge_chunks').insert(rows);
      if (error) throw error;
    }
    await db
      .from('training_videos')
      .update({
        status: 'ready',
        transcript: text,
        summary: text.length > 120 ? text.slice(0, 120) + '…' : text,
      })
      .eq('id', videoId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from('training_videos')
      .update({ status: 'error', error_message: message })
      .eq('id', videoId);
    throw e;
  }
}
