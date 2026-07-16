import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { authorizeAvatar, getAppUser } from '@/lib/authServer';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit } from '@/lib/rateLimit';
import { MAX_VIDEO_BYTES, MAX_VIDEO_LABEL } from '@/lib/uploadLimits';
import {
  canAddMaterial,
  getMaterialBytesUsed,
  getPlanUsage,
  planLimitResponse,
} from '@/lib/planEnforce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EXT = /^(mp4|mov|m4v|webm|mkv|avi)$/;

/**
 * 動画の直接アップロード用に、Supabase Storage の署名付きアップロード
 * 先(path + token)を発行する。実ファイルはブラウザから Storage へ
 * 直接 PUT されるので、Vercel の本文サイズ上限(約4.5MB)を受けない。
 *
 * - avatarId あり: 既存ブレインへの追加学習。所有者本人のみ。
 *   path は `${avatarId}/…` で、後段の /train がそのまま記録する。
 * - avatarId なし: ブレイン新規作成用。path は `staged/…` に置かれ、
 *   /api/avatars がブレイン作成後に本来の場所へ move する。
 *
 * サイズはここでは自己申告値で事前チェックし、受領側(作成/学習 API)
 * が Storage 上の実サイズで再検証する。
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const limited = enforceRateLimit(`upload-sign:${me.email}`, 20, 60_000);
  if (limited) return limited;

  let body: {
    avatarId?: string;
    fileName?: string;
    size?: number;
    mimeType?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'size is required' }, { status: 400 });
  }
  if (size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: `動画は 1 ファイル ${MAX_VIDEO_LABEL} までです。` },
      { status: 413 },
    );
  }

  // プラン容量(自己申告サイズでの事前チェック。実サイズは受領側で
  // 再検証する)。管理者は無制限。
  if (me.role !== 'admin') {
    const usage = await getPlanUsage(me);
    const existing = await getMaterialBytesUsed(me);
    if (!canAddMaterial(usage.plan, existing, size)) {
      return NextResponse.json(planLimitResponse('materials', usage), {
        status: 403,
      });
    }
  }

  const extRaw = (body.fileName?.split('.').pop() || 'mp4').toLowerCase();
  const ext = ALLOWED_EXT.test(extRaw) ? extRaw : 'mp4';

  let path: string;
  if (body.avatarId) {
    const auth = await authorizeAvatar(body.avatarId, { requireOwner: true });
    if (!auth.ok) {
      return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
    }
    if (auth.fromRequest) {
      return NextResponse.json(
        {
          error: '依頼で作成されたブレインには素材を追加できません。',
          code: 'request_brain_locked',
        },
        { status: 403 },
      );
    }
    path = `${body.avatarId}/${randomUUID()}.${ext}`;
  } else {
    // ブレイン未作成の段階なので一時領域へ。パスの UUID は推測不能で、
    // 発行から使用までの短命な置き場としてはこれで十分。
    path = `staged/${randomUUID()}.${ext}`;
  }

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
  });
}
