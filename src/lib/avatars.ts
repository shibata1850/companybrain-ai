import { storageBucket, supabaseAdmin } from './supabase';

/**
 * Permanently delete one or more avatars. Removes the storage files
 * (cover image + all training video uploads) and then deletes the DB
 * rows. Related rows in training_videos / knowledge_chunks / generations
 * cascade via ON DELETE CASCADE.
 *
 * NOTE: This does not delete the corresponding Photo Avatar or cloned
 * voice on HeyGen — those continue to exist in the HeyGen account.
 */
export async function permanentlyDeleteAvatars(
  ids: string[],
): Promise<{ deleted: number }> {
  if (ids.length === 0) return { deleted: 0 };
  const db = supabaseAdmin();
  const bucket = storageBucket();

  const { data: avatars } = await db
    .from('avatars')
    .select('id, cover_image_path')
    .in('id', ids);
  const { data: videos } = await db
    .from('training_videos')
    .select('storage_path')
    .in('avatar_id', ids);

  const paths: string[] = [];
  for (const a of avatars ?? []) {
    if (a.cover_image_path) paths.push(a.cover_image_path);
  }
  for (const v of videos ?? []) {
    if (v.storage_path) paths.push(v.storage_path);
  }
  if (paths.length > 0) {
    await db.storage.from(bucket).remove(paths);
  }

  const { error } = await db.from('avatars').delete().in('id', ids);
  if (error) throw new Error(error.message);
  return { deleted: ids.length };
}
