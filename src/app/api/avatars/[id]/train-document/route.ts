import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { authorizeAvatar } from '@/lib/authServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { reportError } from '@/lib/errorReport';
import { supabaseAdmin } from '@/lib/supabase';
import { chunkTranscript, embedTexts, understandMaterial } from '@/lib/gemini';
import { saveExtractedRules } from '@/lib/materialRules';
import { detectDocKind, extractDocumentText } from '@/lib/documentText';
import {
  canAddMaterial,
  getMaterialBytesUsed,
  getPlanUsage,
  planLimitResponse,
} from '@/lib/planEnforce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** 直接アップロードの上限。文書はテキストなのでこれで十分。 */
const MAX_DOC_BYTES = 15 * 1024 * 1024;

/**
 * 社内文書(PDF / Word / Excel / CSV / テキスト)をアップロードして学習
 * させる。サーバー側でテキストを抽出し、train-text と同じ RAG パイプ
 * ライン(分割 → 埋め込み → 理解)に流す。原本ファイルは保存せず、抽出
 * したテキストのみを保持する(容量はプラン上限に計上する)。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authorizeAvatar(params.id, { requireOwner: true });
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  const limited = enforceRateLimit(`train-doc:${auth.me.email}`, 20, 60_000);
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

  const form = await req.formData();
  const file = form.get('document');
  const folderRaw = form.get('folder');
  const folder =
    typeof folderRaw === 'string' && folderRaw.trim() ? folderRaw.trim() : null;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: 'ファイルが指定されていません。' },
      { status: 400 },
    );
  }
  if (file.size > MAX_DOC_BYTES) {
    return NextResponse.json(
      { error: 'ファイルが大きすぎます(上限 15 MB)。分割してお試しください。' },
      { status: 400 },
    );
  }

  const mimeType = file.type || '';
  const fileName = file.name || 'document';
  if (!detectDocKind(mimeType, fileName)) {
    return NextResponse.json(
      {
        error:
          '対応していない形式です。PDF / Word(.docx) / Excel(.xlsx) / CSV / テキストに対応しています。',
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // プラン: 素材容量の上限チェック(管理者は対象外)。実サイズで検証。
  if (auth.me.role !== 'admin') {
    const usage = await getPlanUsage(auth.me);
    const existing = await getMaterialBytesUsed(auth.me);
    if (!canAddMaterial(usage.plan, existing, buffer.length)) {
      return NextResponse.json(planLimitResponse('materials', usage), {
        status: 403,
      });
    }
  }

  let text: string;
  try {
    const extracted = await extractDocumentText(buffer, mimeType, fileName);
    text = extracted.text;
  } catch (e) {
    reportError(e, {
      route: 'POST /api/avatars/[id]/train-document (extract)',
      actor: auth.me.email,
    });
    return NextResponse.json(
      { error: 'ファイルの読み取りに失敗しました。別の形式でお試しください。' },
      { status: 400 },
    );
  }

  if (!text.trim()) {
    return NextResponse.json(
      {
        error:
          '文書からテキストを抽出できませんでした(画像だけの PDF などの可能性があります)。',
      },
      { status: 400 },
    );
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

  const { data: tv, error: tvErr } = await db
    .from('training_videos')
    .insert({
      avatar_id: params.id,
      storage_path: null,
      file_name: fileName,
      mime_type: mimeType || 'application/octet-stream',
      size_bytes: buffer.length,
      source_type: 'document',
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

    // 素材の「理解」: 要約と振る舞いルールの抽出。失敗しても学習本体は
    // 成立させ、要約は先頭の切り出しにフォールバック。
    let summary = text.length > 120 ? text.slice(0, 120) + '…' : text;
    let rules: string[] = [];
    try {
      const understood = await understandMaterial(text);
      if (understood.summary) summary = understood.summary;
      rules = understood.rules;
    } catch (e) {
      console.warn(
        '[train-document] understandMaterial failed:',
        e instanceof Error ? e.message : String(e),
      );
    }

    await db
      .from('training_videos')
      .update({ status: 'ready', transcript: text, summary })
      .eq('id', videoId);
    await saveExtractedRules(videoId, rules);
  } catch (e) {
    reportError(e, {
      route: 'POST /api/avatars/[id]/train-document',
      actor: auth.me.email,
    });
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from('training_videos')
      .update({ status: 'error', error_message: message })
      .eq('id', videoId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  revalidatePath(`/avatars/${params.id}`);
  return NextResponse.json({ id: videoId, chars: text.length });
}
