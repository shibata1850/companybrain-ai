import { NextRequest, NextResponse } from 'next/server';
import { authorizeAvatar } from '@/lib/authServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { reportError } from '@/lib/errorReport';
import { randomUUID } from 'node:crypto';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { processTrainingVideo } from '@/lib/processing';
import {
  canAddMaterial,
  getMaterialBytesUsed,
  getPlanUsage,
  planLimitResponse,
} from '@/lib/planEnforce';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Add another training video to an existing avatar. We do NOT re-create
 * the HeyGen avatar/voice — those are locked in from the first upload.
 * We just transcribe + embed the new content for retrieval.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authorizeAvatar(params.id);
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  const limited = enforceRateLimit(`train:${auth.me.email}`, 20, 60_000);
  if (limited) return limited;
  if (auth.fromRequest) {
    return NextResponse.json(
      {
        error: '依頼で作成されたブレインには素材を追加できません。',
        code: 'request_brain_locked',
      },
      { status: 403 },
    );
  }
  const avatarId = params.id;
  const db = supabaseAdmin();

  const { data: avatar } = await db
    .from('avatars')
    .select('id')
    .eq('id', avatarId)
    .single();
  if (!avatar) {
    return NextResponse.json({ error: 'avatar not found' }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get('video');
  const folderRaw = form.get('folder');
  const folder =
    typeof folderRaw === 'string' && folderRaw.trim()
      ? folderRaw.trim()
      : null;
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'video file is required' },
      { status: 400 },
    );
  }

  const videoBytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'video/mp4';
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
  const storagePath = `${avatarId}/${randomUUID()}.${ext}`;

  // Plan enforcement: material size. Admins are uncapped; the gifted
  // request-brain itself is already blocked above (fromRequest).
  if (auth.me.role !== 'admin') {
    const usage = await getPlanUsage(auth.me);
    const existing = await getMaterialBytesUsed(auth.me);
    if (!canAddMaterial(usage.plan, existing, videoBytes.length)) {
      return NextResponse.json(planLimitResponse('materials', usage), {
        status: 403,
      });
    }
  }

  const { error: upErr } = await db.storage
    .from(storageBucket())
    .upload(storagePath, videoBytes, { contentType: mimeType, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: tv, error: tvErr } = await db
    .from('training_videos')
    .insert({
      avatar_id: avatarId,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: mimeType,
      size_bytes: videoBytes.length,
      folder,
      status: 'pending',
    })
    .select('id')
    .single();
  if (tvErr || !tv) {
    return NextResponse.json(
      { error: tvErr?.message || 'insert failed' },
      { status: 500 },
    );
  }
  const videoId = tv.id as string;

  try {
    await processTrainingVideo({ avatarId, videoId, videoBytes, mimeType });
  } catch (e) {
    reportError(e, { route: 'POST /api/avatars/[id]/train', actor: auth.me.email });
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message, video_id: videoId }, { status: 500 });
  }

  return NextResponse.json({ video_id: videoId });
}
