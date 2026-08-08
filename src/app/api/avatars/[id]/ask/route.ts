import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
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
 * Generate a draft answer (Gemini only — no HeyGen render yet). The user
 * then reviews / edits / regenerates the draft and explicitly clicks
 * "動画にする" to spend HeyGen credits.
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

  // Conversation log row. status='spoken' means the answer has been (or
  // is about to be) spoken live by the streaming avatar — no separate
  // video render step in this flow.
  const { data: gen, error: genErr } = await db
    .from('generations')
    .insert({ avatar_id: avatarId, question, status: 'spoken' })
    .select('id')
    .single();
  if (genErr || !gen) {
    return NextResponse.json(
      { error: genErr?.message || 'insert failed' },
      { status: 500 },
    );
  }
  const generationId = gen.id as string;

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

    await db
      .from('generations')
      .update({
        answer,
        status: 'spoken',
        updated_at: new Date().toISOString(),
      })
      .eq('id', generationId);

    revalidatePath(`/avatars/${avatarId}`);
    return NextResponse.json({ id: generationId, answer, length });
  } catch (e) {
    reportError(e, { route: 'POST /api/avatars/[id]/ask', actor: auth.me.email });
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from('generations')
      .update({
        status: 'error',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', generationId);
    return NextResponse.json(
      { error: message, id: generationId },
      { status: 500 },
    );
  }
}
