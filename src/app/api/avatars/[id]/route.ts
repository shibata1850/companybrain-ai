import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { permanentlyDeleteAvatars } from '@/lib/avatars';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    .select(
      'id, file_name, mime_type, status, summary, transcript, folder, created_at',
    )
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

  let coverUrl: string | null = null;
  if (avatar.cover_image_path) {
    const { data: signed } = await db.storage
      .from(storageBucket())
      .createSignedUrl(avatar.cover_image_path, 60 * 60);
    coverUrl = signed?.signedUrl ?? null;
  }
  let stageUrl: string | null = null;
  if (avatar.stage_image_path) {
    const { data: signed } = await db.storage
      .from(storageBucket())
      .createSignedUrl(avatar.stage_image_path, 60 * 60);
    stageUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    avatar: { ...avatar, cover_url: coverUrl, stage_url: stageUrl },
    training_videos: videos ?? [],
    generations: generations ?? [],
  });
}

/**
 * PATCH updates editable avatar fields: name and description for now.
 * Anything else in the body is ignored.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string | null;
  };
  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: 'name cannot be empty' },
        { status: 400 },
      );
    }
    updates.name = trimmed;
  }
  if (body.description !== undefined) {
    updates.description =
      typeof body.description === 'string'
        ? body.description.trim() || null
        : null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from('avatars')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath('/');
  revalidatePath(`/avatars/${params.id}`);
  return NextResponse.json({ ok: true });
}

/**
 * DELETE moves the avatar to the trash by default (sets deleted_at to
 * now). Pass ?permanent=true to delete the row outright and clean up
 * its storage files.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const url = new URL(req.url);
  const permanent = url.searchParams.get('permanent') === 'true';
  const db = supabaseAdmin();

  if (permanent) {
    try {
      await permanentlyDeleteAvatars([params.id]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
    revalidatePath('/');
    revalidatePath('/trash');
    return NextResponse.json({ ok: true, permanent: true });
  }

  const { error } = await db
    .from('avatars')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath('/');
  revalidatePath('/trash');
  return NextResponse.json({ ok: true });
}
