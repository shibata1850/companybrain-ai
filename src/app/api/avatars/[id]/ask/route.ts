import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { answerAsPersona, type AnswerLength } from '@/lib/gemini';
import { authorizeAvatar } from '@/lib/authServer';
import { collectMaterialRules } from '@/lib/materialRules';
import { searchKnowledge } from '@/lib/retrieval';
import { enforceRateLimit } from '@/lib/rateLimit';
import { reportError } from '@/lib/errorReport';
import {
  adminAnswerModel,
  answerModelForPlan,
  canAsk,
  getPlanUsage,
  planLimitResponse,
} from '@/lib/planEnforce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * テキスト質問に人物として回答する(RAG + プラン別モデル)。
 * チャット画面の表示・会話記録はクライアント側(localStorage +
 * /api/audit への監査記録)が担うため、このルートはサーバーに
 * 会話を保存しない。
 *
 * Body: { question: string, length?: 'short' | 'standard' | 'detailed' }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const avatarId = params.id;

  // Auth + brain ownership.
  const auth = await authorizeAvatar(avatarId);
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  const limited = enforceRateLimit(`ask:${auth.me.email}`, 30, 60_000);
  if (limited) return limited;
  // Plan enforcement: members only. Admins have no plan / no caps.
  const usage =
    auth.me.role === 'admin' ? null : await getPlanUsage(auth.me);
  if (usage && !canAsk(usage)) {
    return NextResponse.json(planLimitResponse('questions', usage), {
      status: 403,
    });
  }

  const body = (await req.json()) as {
    question?: string;
    length?: AnswerLength;
  };
  const question = body.question?.trim();
  const length: AnswerLength = body.length ?? 'standard';
  if (!question) {
    return NextResponse.json(
      { error: 'question is required' },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const { data: avatar } = await db
    .from('avatars')
    .select('id, name')
    .eq('id', avatarId)
    .single();
  if (!avatar) {
    return NextResponse.json({ error: 'avatar not found' }, { status: 404 });
  }

  // NOTE: 旧実装はここで generations テーブルに質問・回答を記録していた
  // (D-ID/HeyGen時代の「回答→動画生成」フローの名残)。読み手が無く、
  // 質問数カウントも監査も audit_logs 基盤のため、記録を廃止した。

  try {
    // ハイブリッド検索(キーワード + 意味)。音声側の knowledge ルートと
    // 同じ検索を使い、テキスト回答でも同じ精度にする。
    const hits = await searchKnowledge(avatarId, question, 8);
    // 素材名を添えて渡し、どの資料に基づく回答かを示せるようにする。
    const knowledge = hits.map((h) =>
      h.materialName ? `【${h.materialName}】 ${h.content}` : h.content,
    );

    // 学習素材から抽出した振る舞いルール(毎回適用)。
    const rules = await collectMaterialRules(avatarId);

    const answer = await answerAsPersona({
      personaName: avatar.name,
      question,
      knowledge,
      length,
      rules: rules || undefined,
      // Higher plans route to higher-tier Gemini models automatically.
      // Admins always get the highest-quality model.
      model: usage ? answerModelForPlan(usage.plan) : adminAnswerModel(),
    });

    return NextResponse.json({ answer, length });
  } catch (e) {
    reportError(e, { route: 'POST /api/avatars/[id]/ask', actor: auth.me.email });
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
