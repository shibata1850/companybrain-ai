import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAppUser } from '@/lib/authServer';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

/**
 * Upload the caller's profile picture. Reads a single `photo` field
 * from a multipart form, writes it to storage under a per-user prefix,
 * deletes the previous file (best effort), and records the new path on
 * app_users.avatar_path.
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get('photo');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'photo file is required' },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: '5MB 以下の画像をアップロードしてください' },
      { status: 400 },
    );
  }
  const mime = file.type || 'image/png';
  if (!ALLOWED.has(mime)) {
    return NextResponse.json(
      { error: 'PNG / JPEG / WebP / GIF のいずれかをご利用ください' },
      { status: 400 },
    );
  }

  const ext = (mime.split('/')[1] || 'png').toLowerCase();
  const slug = me.email.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
  const newPath = `user-avatars/${slug}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const db = supabaseAdmin();
  const bucket = storageBucket();

  // Read previous path so we can clean it up after the new upload lands.
  const { data: existing } = await db
    .from('app_users')
    .select('avatar_path')
    .eq('email', me.email.toLowerCase())
    .single();
  const previousPath = existing?.avatar_path ?? null;

  const { error: upErr } = await db.storage
    .from(bucket)
    .upload(newPath, bytes, { contentType: mime, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { error: dbErr } = await db
    .from('app_users')
    .update({ avatar_path: newPath })
    .eq('email', me.email.toLowerCase());
  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  if (previousPath && previousPath !== newPath) {
    try {
      await db.storage.from(bucket).remove([previousPath]);
    } catch {
      // best effort
    }
  }

  // Return a signed URL the client can render immediately.
  const { data: signed } = await db.storage
    .from(bucket)
    .createSignedUrl(newPath, 60 * 60);
  return NextResponse.json({
    ok: true,
    avatar_url: signed?.signedUrl ?? null,
  });
}

/** Remove the caller's profile picture (return to initial-letter tile). */
export async function DELETE() {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from('app_users')
    .select('avatar_path')
    .eq('email', me.email.toLowerCase())
    .single();
  const path = existing?.avatar_path ?? null;
  const { error } = await db
    .from('app_users')
    .update({ avatar_path: null })
    .eq('email', me.email.toLowerCase());
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (path) {
    try {
      await db.storage.from(storageBucket()).remove([path]);
    } catch {
      // best effort
    }
  }
  return NextResponse.json({ ok: true });
}
