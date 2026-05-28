import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { permanentlyDeleteAvatars } from '@/lib/avatars';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('avatars')
    .select('id, name, description, cover_image_path, deleted_at, created_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ avatars: data ?? [] });
}

/**
 * Empty the trash — permanently delete every avatar whose deleted_at
 * is set, including their storage files.
 */
export async function DELETE() {
  const db = supabaseAdmin();
  const { data: trashed, error } = await db
    .from('avatars')
    .select('id')
    .not('deleted_at', 'is', null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const ids = (trashed ?? []).map((a) => a.id as string);
  try {
    const result = await permanentlyDeleteAvatars(ids);
    revalidatePath('/');
    revalidatePath('/trash');
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
