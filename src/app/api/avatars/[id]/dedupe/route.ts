import { NextRequest, NextResponse } from 'next/server';
import { authorizeAvatar } from '@/lib/authServer';
import { enforceRateLimit } from '@/lib/rateLimit';
import { reportError } from '@/lib/errorReport';
import { supabaseAdmin } from '@/lib/supabase';
import { embedTexts } from '@/lib/gemini';
import {
  clusterByPairs,
  clusterMaxSimilarity,
  similarPairs,
} from '@/lib/dedupe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// この類似度以上の素材を「まとめてよい候補」とみなす。高めに設定して
// 誤検出を抑える(0.90 前後で「ほぼ同じ内容」)。
const SIMILARITY_THRESHOLD = 0.9;

type Material = {
  id: string;
  file_name: string | null;
  summary: string | null;
  transcript: string | null;
  folder: string | null;
};

/**
 * ブレインの素材から「意味が重複/類似していて1つにまとめてよい」候補を
 * 検出して提案する(実行はしない)。各素材の要約(なければ本文の先頭)を
 * 埋め込み、コサイン類似度が閾値以上のものを連結成分でグルーピングする。
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authorizeAvatar(params.id, { requireOwner: true });
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  if (auth.fromRequest) {
    return NextResponse.json(
      { error: '依頼で作成されたブレインの素材は変更できません。' },
      { status: 403 },
    );
  }
  const limited = enforceRateLimit(`dedupe:${auth.me.email}`, 10, 60_000);
  if (limited) return limited;

  const db = supabaseAdmin();
  const { data: rows } = await db
    .from('training_videos')
    .select('id, file_name, summary, transcript, folder')
    .eq('avatar_id', params.id)
    .eq('status', 'ready')
    .order('created_at', { ascending: true })
    .limit(200);
  const materials = (rows ?? []) as Material[];
  if (materials.length < 2) {
    return NextResponse.json({ groups: [] });
  }

  try {
    // 各素材の「意味」を表す短いテキスト。要約優先、無ければ本文の先頭。
    const texts = materials.map((m) => {
      const base = (m.summary || m.transcript || m.file_name || '').trim();
      return base.slice(0, 2000) || '(空)';
    });
    const vectors = await embedTexts(texts);
    if (vectors.length !== materials.length) {
      throw new Error('embedding count mismatch');
    }

    const pairs = similarPairs(vectors, SIMILARITY_THRESHOLD);
    const clusters = clusterByPairs(materials.length, pairs);

    const groups = clusters.map((idxs) => ({
      similarity: Math.round(clusterMaxSimilarity(idxs, pairs) * 100),
      members: idxs.map((i) => ({
        id: materials[i].id,
        file_name: materials[i].file_name,
        summary: materials[i].summary,
        folder: materials[i].folder,
      })),
    }));
    // 似ている度合いが高い順に。
    groups.sort((a, b) => b.similarity - a.similarity);

    return NextResponse.json({ groups });
  } catch (e) {
    reportError(e, {
      route: 'POST /api/avatars/[id]/dedupe',
      actor: auth.me.email,
    });
    return NextResponse.json(
      { error: '重複の検出に失敗しました。時間をおいて再試行してください。' },
      { status: 500 },
    );
  }
}
