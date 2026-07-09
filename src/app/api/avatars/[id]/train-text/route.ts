import { NextRequest, NextResponse } from 'next/server';
import { authorizeAvatar } from '@/lib/authServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { reportError } from '@/lib/errorReport';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { chunkTranscript, embedTexts, understandMaterial } from '@/lib/gemini';
import { saveExtractedRules } from '@/lib/materialRules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Add a piece of plain-text knowledge to the avatar. Chunks it, embeds
 * each chunk with Gemini, and stores the result in knowledge_chunks so
 * it can be retrieved by RAG at question time.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authorizeAvatar(params.id);
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  const limited = enforceRateLimit(`train-text:${auth.me.email}`, 20, 60_000);
  if (limited) return limited;
  if (auth.fromRequest) {
    return NextResponse.json(
      {
        error: '依頼で作成されたブレインには素材を追加できません。',
        code: 'request_brain_locked',
      },
      { status: 403 },
    );
  }
  const body = (await req.json()) as {
    text?: string;
    title?: string;
    folder?: string | null;
  };
  const text = body.text?.trim();
  const title = body.title?.trim() || null;
  const folder =
    typeof body.folder === 'string' ? body.folder.trim() || null : null;
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
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

  // Record this entry alongside training videos so the UI can list it.
  const { data: tv, error: tvErr } = await db
    .from('training_videos')
    .insert({
      avatar_id: params.id,
      storage_path: null,
      file_name: title ?? 'テキスト学習',
      mime_type: 'text/plain',
      source_type: 'text',
      folder,
      status: 'processing',
    })
    .select('id')
    .single();
  if (tvErr || !tv) {
    return NextResponse.json(
      { error: tvErr?.message || 'insert failed' },
      { status: 500 },
    );
  }
  const videoId = tv.id as string;

  try {
    const chunks = chunkTranscript(text);
    const embeddings = chunks.length > 0 ? await embedTexts(chunks) : [];
    if (chunks.length > 0) {
      const rows = chunks.map((content, i) => ({
        avatar_id: params.id,
        video_id: videoId,
        content,
        embedding: embeddings[i],
      }));
      const { error } = await db.from('knowledge_chunks').insert(rows);
      if (error) throw error;
    }
    // 素材の「理解」: 要約と振る舞いルールの抽出。失敗しても学習
    // 本体は成立させ、要約は従来どおり先頭の切り出しにフォールバック。
    let summary = text.length > 120 ? text.slice(0, 120) + '…' : text;
    let rules: string[] = [];
    try {
      const understood = await understandMaterial(text);
      if (understood.summary) summary = understood.summary;
      rules = understood.rules;
    } catch (e) {
      console.warn(
        '[train-text] understandMaterial failed:',
        e instanceof Error ? e.message : String(e),
      );
    }

    await db
      .from('training_videos')
      .update({
        status: 'ready',
        transcript: text,
        summary,
      })
      .eq('id', videoId);
    await saveExtractedRules(videoId, rules);
  } catch (e) {
    reportError(e, { route: 'POST /api/avatars/[id]/train-text', actor: auth.me.email });
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from('training_videos')
      .update({ status: 'error', error_message: message })
      .eq('id', videoId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  revalidatePath(`/avatars/${params.id}`);
  return NextResponse.json({ id: videoId });
}
