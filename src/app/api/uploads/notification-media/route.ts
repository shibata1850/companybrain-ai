import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAppUser } from '@/lib/authServer';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// お知らせ添付で受け付ける拡張子。
const IMAGE_EXT = /^(jpg|jpeg|png|gif|webp|heic)$/;
const VIDEO_EXT = /^(mp4|mov|m4v|webm)$/;

// 添付の上限。動画は文字起こし等の後段処理が無く保存するだけなので、
// 学習動画(50MB)より少し大きめでも許容する。
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/**
 * 管理者がお知らせに添付する画像/動画の直接アップロード先(署名付き
 * path + token)を発行する。実ファイルはブラウザから Storage へ直接
 * 送られるため、Vercel の本文サイズ上限(約4.5MB)を受けない。
 * 添付は notifications/ 配下に置く。
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const limited = enforceRateLimit(`notif-upload:${me.email}`, 30, 60_000);
  if (limited) return limited;

  let body: { fileName?: string; size?: number; mimeType?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const extRaw = (body.fileName?.split('.').pop() || '').toLowerCase();
  const isImage = IMAGE_EXT.test(extRaw);
  const isVideo = VIDEO_EXT.test(extRaw);
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: '画像(jpg/png/gif/webp)または動画(mp4/mov/webm)を選んでください。' },
      { status: 400 },
    );
  }

  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'size is required' }, { status: 400 });
  }
  const cap = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (size > cap) {
    return NextResponse.json(
      {
        error: `${isVideo ? '動画' : '画像'}は ${Math.round(
          cap / (1024 * 1024),
        )} MB までです。`,
      },
      { status: 413 },
    );
  }

  const path = `notifications/${randomUUID()}.${extRaw}`;
  const db = supabaseAdmin();
  const { data, error } = await db.storage
    .from(storageBucket())
    .createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'failed to sign upload' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    bucket: storageBucket(),
    path: data.path,
    token: data.token,
    mediaType: isVideo ? 'video' : 'image',
  });
}
