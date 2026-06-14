import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { permanentlyDeleteAvatars } from '@/lib/avatars';
import { getAppUser } from '@/lib/authServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = supabaseAdmin();
  let query = db
    .from('avatars')
    .select('id, name, description, cover_image_path, deleted_at, created_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  // Members only see their own trashed brains; admins see all.
  if (me.role !== 'admin') query = query.eq('owner_email', me.email);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ avatars: data ?? [] });
}

/**
 * Empty the trash — permanently delete trashed avatars (the caller's
 * own; admins empty everyone's), including their storage files.
 */
export async function DELETE() {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = supabaseAdmin();
  let trashQuery = db
    .from('avatars')
    .select('id')
    .not('deleted_at', 'is', null);
  if (me.role !== 'admin') trashQuery = trashQuery.eq('owner_email', me.email);
  const { data: trashed, error } = await trashQuery;
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
