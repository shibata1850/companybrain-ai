import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { authorizeAvatar } from '@/lib/authServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { reportError } from '@/lib/errorReport';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import {
  chunkTranscript,
  embedTexts,
  understandMaterial,
} from '@/lib/gemini';
import { saveExtractedRules } from '@/lib/materialRules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Row = {
  id: string;
  file_name: string | null;
  transcript: string | null;
  folder: string | null;
  storage_path: string | null;
  created_at: string;
};

/**
 * 指定した複数素材を1つに統合する。
 *   - 先頭(最も古い)素材を統合先として残す
 *   - 全員の本文を結合して統合先の本文にし、要約・ルール・チャンクを
 *     作り直す
 *   - 残りの素材とそのチャンクは削除する
 * body: { ids: string[], title?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authorizeAvatar(params.id);
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  if (auth.fromRequest) {
    return NextResponse.json(
      { error: '依頼で作成されたブレインの素材は変更できません。' },
      { status: 403 },
    );
  }
  const limited = enforceRateLimit(`dedupe-merge:${auth.me.email}`, 20, 60_000);
  if (limited) return limited;

  let body: { ids?: string[]; title?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((x) => typeof x === 'string'))]
    : [];
  if (ids.length < 2) {
    return NextResponse.json(
      { error: '統合するには2件以上を指定してください。' },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const { data: rows } = await db
    .from('training_videos')
    .select('id, file_name, transcript, folder, storage_path, created_at')
    .eq('avatar_id', params.id)
    .in('id', ids)
    .order('created_at', { ascending: true });
  const materials = (rows ?? []) as Row[];
  // 指定 ID が全てこのブレインの素材であることを担保(他ブレイン混入防止)。
  if (materials.length !== ids.length) {
    return NextResponse.json(
      { error: '対象の素材が見つかりません。画面を更新してください。' },
      { status: 400 },
    );
  }

  const target = materials[0];
  const others = materials.slice(1);

  const combined = materials
    .map((m) => (m.transcript ?? '').trim())
    .filter(Boolean)
    .join('\n\n---\n\n');
  if (!combined) {
    return NextResponse.json(
      { error: '本文のある素材がありません。' },
      { status: 400 },
    );
  }

  try {
    // 統合先の本文を差し替え、要約・ルール・チャンクを作り直す。
    let summary =
      combined.length > 120 ? combined.slice(0, 120) + '…' : combined;
    let rules: string[] = [];
    try {
      const understood = await understandMaterial(combined);
      if (understood.summary) summary = understood.summary;
      rules = understood.rules;
    } catch (e) {
      console.warn(
        '[dedupe-merge] understandMaterial failed:',
        e instanceof Error ? e.message : String(e),
      );
    }

    const chunks = chunkTranscript(combined);
    const embeddings = chunks.length > 0 ? await embedTexts(chunks) : [];

    // 統合先の古いチャンクを削除して作り直す。
    await db.from('knowledge_chunks').delete().eq('video_id', target.id);
    if (chunks.length > 0) {
      const chunkRows = chunks.map((content, i) => ({
        avatar_id: params.id,
        video_id: target.id,
        content,
        embedding: embeddings[i],
      }));
      const { error: insErr } = await db
        .from('knowledge_chunks')
        .insert(chunkRows);
      if (insErr) throw insErr;
    }

    const mergedTitle =
      (typeof body.title === 'string' && body.title.trim()) ||
      target.file_name ||
      '統合された素材';
    await db
      .from('training_videos')
      .update({
        file_name: mergedTitle.slice(0, 200),
        transcript: combined,
        summary,
        status: 'ready',
      })
      .eq('id', target.id);
    await saveExtractedRules(target.id, rules);

    // 残りの素材を削除(chunks は ON DELETE CASCADE で消える)。
    // 動画実体が Storage にあれば併せて掃除する(既存の素材削除と同挙動)。
    const otherIds = others.map((m) => m.id);
    const otherPaths = others
      .map((m) => m.storage_path)
      .filter((p): p is string => !!p);
    if (otherPaths.length > 0) {
      await db.storage.from(storageBucket()).remove(otherPaths);
    }
    if (otherIds.length > 0) {
      await db.from('training_videos').delete().in('id', otherIds);
    }

    revalidatePath(`/avatars/${params.id}`);
    return NextResponse.json({ ok: true, merged_into: target.id });
  } catch (e) {
    reportError(e, {
      route: 'POST /api/avatars/[id]/dedupe/merge',
      actor: auth.me.email,
    });
    return NextResponse.json(
      { error: '統合に失敗しました。時間をおいて再試行してください。' },
      { status: 500 },
    );
  }
}
