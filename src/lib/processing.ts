import {
  chunkTranscript,
  embedTexts,
  transcribeVideo,
  understandMaterial,
} from './gemini';
import { saveExtractedRules } from './materialRules';
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
    const { transcript, summary: transcribeSummary } = await transcribeVideo(
      params.videoBytes,
      params.mimeType,
    );

    // 素材の「理解」: 要約と振る舞いルールの抽出。失敗しても学習
    // 本体(文字起こし+埋め込み)は成立させる。
    let summary = transcribeSummary;
    let rules: string[] = [];
    try {
      const understood = await understandMaterial(transcript);
      if (understood.summary) summary = understood.summary;
      rules = understood.rules;
    } catch (e) {
      console.warn(
        '[processing] understandMaterial failed (要約は文字起こし結果を使用):',
        e instanceof Error ? e.message : String(e),
      );
    }

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
    await saveExtractedRules(params.videoId, rules);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from('training_videos')
      .update({ status: 'error', error_message: message })
      .eq('id', params.videoId);
    throw e;
  }
}
