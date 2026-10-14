import { NextRequest, NextResponse } from 'next/server';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { clientIp, kioskConfig, kioskKeyMatches } from '@/lib/kioskAuth';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** キオスクの待機画面用: 表示するブレインの名前とアイコンを返す。 */
export async function GET(req: NextRequest) {
  const cfg = kioskConfig();
  if (!cfg) {
    return NextResponse.json({ error: 'kiosk is not configured' }, { status: 503 });
  }
  const limited = enforceRateLimit(`kiosk-info:${clientIp(req)}`, 30, 60_000);
  if (limited) return limited;
  const key = new URL(req.url).searchParams.get('k');
  if (!kioskKeyMatches(key, cfg.key)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const db = supabaseAdmin();
  const { data: avatar } = await db
    .from('avatars')
    .select('id, name, description, cover_image_path')
    .eq('id', cfg.avatarId)
    .is('deleted_at', null)
    .single();
  if (!avatar) {
    return NextResponse.json({ error: 'avatar not found' }, { status: 404 });
  }
  let coverUrl: string | null = null;
  if (avatar.cover_image_path) {
    const { data: signed } = await db.storage
      .from(storageBucket())
      .createSignedUrl(avatar.cover_image_path as string, 60 * 60 * 12);
    coverUrl = signed?.signedUrl ?? null;
  }
  return NextResponse.json({
    avatar: {
      id: avatar.id,
      name: avatar.name,
      description: avatar.description ?? null,
      cover_url: coverUrl,
    },
  });
}
