import { chunkTranscript, embedTexts, transcribeVideo } from './gemini';
import { supabaseAdmin } from './supabase';

/**
 * Transcribe a single uploaded training video, chunk the transcript, embed
 * the chunks, and write everything to the database. The training_video
 * row is moved through `processing` → `ready`/`error`.
 */
export async function processTrainingVideo(params: {
  avatarId: string;
  videoId: string;
  videoBytes: Buffer;
  mimeType: string;
}): Promise<void> {
  const db = supabaseAdmin();
  await db
    .from('training_videos')
    .update({ status: 'processing' })
    .eq('id', params.videoId);

  try {
    const { transcript, summary } = await transcribeVideo(
      params.videoBytes,
      params.mimeType,
    );

    const chunks = chunkTranscript(transcript);
    const embeddings = chunks.length > 0 ? await embedTexts(chunks) : [];

    if (chunks.length > 0) {
      const rows = chunks.map((content, i) => ({
        avatar_id: params.avatarId,
        video_id: params.videoId,
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
        transcript,
        summary,
      })
      .eq('id', params.videoId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from('training_videos')
      .update({ status: 'error', error_message: message })
      .eq('id', params.videoId);
    throw e;
  }
}
