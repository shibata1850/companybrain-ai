import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Replace an avatar's streaming-stage background image. Multipart with a
 * `photo` field. We upload at <id>/stage.jpg and point stage_image_path
 * at it. The avatar thumbnail (cover_image_path) is left untouched.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const form = await req.formData();
  const file = form.get('photo');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'photo file is required' },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const { data: avatar } = await db
    .from('avatars')
    .select('id')
    .eq('id', params.id)
    .single();
  if (!avatar) {
    return NextResponse.json({ error: 'avatar not found' }, { status: 404 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const stagePath = `${params.id}/stage.jpg`;
  const { error: upErr } = await db.storage
    .from(storageBucket())
    .upload(stagePath, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await db
    .from('avatars')
    .update({ stage_image_path: stagePath })
    .eq('id', params.id);

  revalidatePath(`/avatars/${params.id}`);
  return NextResponse.json({ ok: true });
}
