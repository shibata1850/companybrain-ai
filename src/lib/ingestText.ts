import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkTranscript, embedTexts } from '@/lib/gemini';

/**
 * Insert or replace one text knowledge entry for a brain: writes the
 * training_videos row, chunks + embeds the text, and stores the chunks.
 *
 * When externalRef is provided and an entry with the same ref already
 * exists for the brain, that entry is updated in place: its old
 * knowledge_chunks are deleted first so an amended document fully
 * replaces the previous version instead of coexisting with it.
 */
export async function upsertTextKnowledge(params: {
  db: SupabaseClient;
  avatarId: string;
  text: string;
  title: string;
  folder: string | null;
  externalRef: string | null;
}): Promise<{ videoId: string; replaced: boolean; unchanged: boolean }> {
  const { db, avatarId, text, title, folder, externalRef } = params;

  let videoId: string | null = null;
  let replaced = false;
  if (externalRef) {
    const { data: existing } = await db
      .from('training_videos')
      .select('id, transcript, status')
      .eq('avatar_id', avatarId)
      .eq('external_ref', externalRef)
      .limit(1);
    if (existing && existing.length > 0) {
      videoId = existing[0].id as string;
      replaced = true;
      // Identical text → the chunks and embeddings are still valid.
      // Skip the expensive re-embed so periodic syncs only pay for
      // entries that actually changed (i.e. amended articles).
      if (
        existing[0].status === 'ready' &&
        (existing[0].transcript as string | null) === text
      ) {
        await db
          .from('training_videos')
          .update({ file_name: title, folder })
          .eq('id', videoId);
        return { videoId, replaced: true, unchanged: true };
      }
      await db
        .from('training_videos')
        .update({ status: 'processing', file_name: title, folder })
        .eq('id', videoId);
      await db.from('knowledge_chunks').delete().eq('video_id', videoId);
    }
  }
  if (!videoId) {
    const { data: tv, error: tvErr } = await db
      .from('training_videos')
      .insert({
        avatar_id: avatarId,
        storage_path: null,
        file_name: title,
        mime_type: 'text/plain',
        source_type: 'text',
        folder,
        external_ref: externalRef,
        status: 'processing',
      })
      .select('id')
      .single();
    if (tvErr || !tv) {
      throw new Error(tvErr?.message || 'training_videos insert failed');
    }
    videoId = tv.id as string;
  }

  try {
    const chunks = chunkTranscript(text);
    const embeddings = chunks.length > 0 ? await embedTexts(chunks) : [];
    if (chunks.length > 0) {
      const rows = chunks.map((content, i) => ({
        avatar_id: avatarId,
        video_id: videoId,
        content,
        embedding: embeddings[i],
      }));
      const { error } = await db.from('knowledge_chunks').insert(rows);
      if (error) throw error;
    }
    await db
      .from('training_videos')
      .update({
        status: 'ready',
        transcript: text,
        summary: text.length > 120 ? text.slice(0, 120) + '…' : text,
      })
      .eq('id', videoId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from('training_videos')
      .update({ status: 'error', error_message: message })
      .eq('id', videoId);
    throw e;
  }

  return { videoId, replaced, unchanged: false };
}

/**
 * Resolve a brain by id or exact name, excluding trashed brains.
 * Throws with a user-readable message when not found / ambiguous.
 */
export async function resolveBrain(
  db: SupabaseClient,
  ref: { brain_id?: string; brain_name?: string },
): Promise<string> {
  if (ref.brain_id) {
    const { data } = await db
      .from('avatars')
      .select('id')
      .eq('id', ref.brain_id)
      .is('deleted_at', null)
      .single();
    if (!data) throw new IngestError(404, 'brain not found');
    return data.id as string;
  }
  if (ref.brain_name?.trim()) {
    const { data } = await db
      .from('avatars')
      .select('id')
      .eq('name', ref.brain_name.trim())
      .is('deleted_at', null)
      .limit(2);
    if ((data?.length ?? 0) > 1) {
      throw new IngestError(
        409,
        `brain_name "${ref.brain_name}" is ambiguous (multiple matches); use brain_id`,
      );
    }
    if (!data || data.length === 0) {
      throw new IngestError(404, 'brain not found');
    }
    return data[0].id as string;
  }
  throw new IngestError(400, 'brain_id or brain_name is required');
}

export class IngestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
