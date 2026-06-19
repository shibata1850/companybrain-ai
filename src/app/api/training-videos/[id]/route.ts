import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { chunkTranscript, embedTexts } from '@/lib/gemini';
import { authorizeAvatar } from '@/lib/authServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Body = {
  file_name?: string | null;
  transcript?: string | null;
  folder?: string | null;
};

/**
 * Update one piece of training material. Editing the transcript invalidates
 * the old knowledge_chunks for this row and re-chunks + re-embeds the new
 * text. Editing only file_name is a cheap rename.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const db = supabaseAdmin();

  const { data: existing, error: getErr } = await db
    .from('training_videos')
    .select('id, avatar_id, transcript')
    .eq('id', params.id)
    .single();
  if (getErr || !existing) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  // Only the owner of the parent brain may edit its material.
  const auth = await authorizeAvatar(existing.avatar_id as string);
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.file_name === 'string') {
    updates.file_name = body.file_name.trim() || null;
  }
  if (body.folder !== undefined) {
    updates.folder =
      typeof body.folder === 'string' ? body.folder.trim() || null : null;
  }
  const transcriptChanged =
    typeof body.transcript === 'string' &&
    body.transcript !== existing.transcript;
  if (transcriptChanged) {
    const next = body.transcript || '';
    updates.transcript = next;
    updates.summary = next.length > 120 ? next.slice(0, 120) + '…' : next;
    updates.status = 'processing';
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error: updErr } = await db
    .from('training_videos')
    .update(updates)
    .eq('id', params.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  if (transcriptChanged) {
    try {
      await db.from('knowledge_chunks').delete().eq('video_id', params.id);
      const newText = (updates.transcript as string) || '';
      const chunks = chunkTranscript(newText);
      if (chunks.length > 0) {
        const embeddings = await embedTexts(chunks);
        const rows = chunks.map((content, i) => ({
          avatar_id: existing.avatar_id,
          video_id: params.id,
          content,
          embedding: embeddings[i],
        }));
        const { error } = await db.from('knowledge_chunks').insert(rows);
        if (error) throw error;
      }
      await db
        .from('training_videos')
        .update({ status: 'ready' })
        .eq('id', params.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db
        .from('training_videos')
        .update({ status: 'error', error_message: message })
        .eq('id', params.id);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  revalidatePath(`/avatars/${existing.avatar_id}`);
  return NextResponse.json({ ok: true });
}

/**
 * Permanently delete one training material entry along with its storage
 * file (if any) and its knowledge_chunks (cascade).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const db = supabaseAdmin();
  const { data: existing, error: getErr } = await db
    .from('training_videos')
    .select('id, avatar_id, storage_path')
    .eq('id', params.id)
    .single();
  if (getErr || !existing) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const auth = await authorizeAvatar(existing.avatar_id as string);
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }

  if (existing.storage_path) {
    await db.storage.from(storageBucket()).remove([existing.storage_path]);
  }

  const { error } = await db
    .from('training_videos')
    .delete()
    .eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath(`/avatars/${existing.avatar_id}`);
  return NextResponse.json({ ok: true });
}
