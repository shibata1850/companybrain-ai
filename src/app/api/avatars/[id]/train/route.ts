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
  const auth = await authorizeAvatar(params.id, { requireOwner: true });
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

  // 2つの受け取り方に対応する:
  //   - JSON: ブラウザが Storage へ直接アップロード済みの video_path を
  //     渡してくる新経路(大きいファイル対応。Vercel 本文上限を回避)
  //   - FormData: ファイル本体を直接受け取る従来経路(小さいファイル)
  let videoBytes: Buffer;
  let mimeType: string;
  let fileName: string;
  let storagePath: string;
  let folder: string | null;

  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    let body: {
      video_path?: string;
      video_name?: string;
      video_mime?: string;
      folder?: string;
    } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid json' }, { status: 400 });
    }
    const path = typeof body.video_path === 'string' ? body.video_path : '';
    // 署名発行時にこのブレイン専用のプレフィックスで切っているので、
    // それ以外のパスは他人/他ブレインの資産の可能性がある → 拒否。
    if (!path.startsWith(`${avatarId}/`) || path.includes('..')) {
      return NextResponse.json({ error: 'invalid video_path' }, { status: 400 });
    }
    const dl = await db.storage.from(storageBucket()).download(path);
    if (dl.error || !dl.data) {
      return NextResponse.json(
        { error: 'アップロード済みの動画が見つかりません。もう一度アップロードしてください。' },
        { status: 400 },
      );
    }
    videoBytes = Buffer.from(await dl.data.arrayBuffer());
    mimeType = body.video_mime || 'video/mp4';
    fileName = body.video_name || path.split('/').pop() || 'video.mp4';
    storagePath = path;
    folder = body.folder?.trim() ? body.folder.trim() : null;
  } else {
    const form = await req.formData();
    const file = form.get('video');
    const folderRaw = form.get('folder');
    folder =
      typeof folderRaw === 'string' && folderRaw.trim()
        ? folderRaw.trim()
        : null;
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'video file is required' },
        { status: 400 },
      );
    }
    videoBytes = Buffer.from(await file.arrayBuffer());
    mimeType = file.type || 'video/mp4';
    fileName = file.name;
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
    storagePath = `${avatarId}/${randomUUID()}.${ext}`;
  }

  // Plan enforcement: material size (実サイズで検証 — 直接アップロード
  // 経路は署名時に自己申告値でしか見ていないため、ここが本検証)。
  // Admins are uncapped; the gifted request-brain itself is already
  // blocked above (fromRequest).
  if (auth.me.role !== 'admin') {
    const usage = await getPlanUsage(auth.me);
    const existing = await getMaterialBytesUsed(auth.me);
    if (!canAddMaterial(usage.plan, existing, videoBytes.length)) {
      // 直接アップロード経路では実体が既に Storage にあるので消しておく
      await db.storage.from(storageBucket()).remove([storagePath]);
      return NextResponse.json(planLimitResponse('materials', usage), {
        status: 403,
      });
    }
  }

  if (!contentType.includes('application/json')) {
    const { error: upErr } = await db.storage
      .from(storageBucket())
      .upload(storagePath, videoBytes, { contentType: mimeType, upsert: false });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  const { data: tv, error: tvErr } = await db
    .from('training_videos')
    .insert({
      avatar_id: avatarId,
      storage_path: storagePath,
      file_name: fileName,
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
