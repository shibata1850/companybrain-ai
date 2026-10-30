import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { authorizeAvatar } from '@/lib/authServer';
import {
  adminLiveModel,
  canAsk,
  canStartVoice,
  getPlanUsage,
  getVoiceSecondsThisMonth,
  liveModelForPlan,
  planLimitResponse,
} from '@/lib/planEnforce';
import type { PlanId } from '@/lib/plans';
import { enforceRateLimit } from '@/lib/rateLimit';
import { mintLiveToken, sanitizeModelOverride } from '@/lib/liveToken';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errorReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Issue a short-lived ephemeral token the browser can use to open a
 * direct WebSocket to the Gemini Live API. The token is bound to a
 * specific Live config so the API key never reaches the client.
 *
 * システム指示・ツール・モデルフォールバック等の中身は lib/liveToken に
 * 一本化してある(キオスク用の /api/kiosk/token と共有)。このルートの
 * 責務は、本人認可・プラン制限・レート制限と応答の組み立て。
 */
export async function POST(req: NextRequest) {
  let body: { avatarId?: string; model?: string; auto?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine; we'll fail below
  }
  const avatarId = body.avatarId;
  if (!avatarId) {
    return NextResponse.json(
      { error: 'avatarId is required' },
      { status: 400 },
    );
  }

  // Authorize: only the brain's owner may open a live session. (Admins
  // have no access to others' brains; this also closes the previous gap
  // where any logged-in user could mint a token for any avatarId.)
  const auth = await authorizeAvatar(avatarId);
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  // Burst guard on token minting (each live session costs real money).
  const limited = enforceRateLimit(
    `live-token:${auth.me.email}`,
    10,
    60_000,
  );
  if (limited) return limited;
  // Enforce the monthly QUESTION quota only — this session carries both
  // text and voice, so refusing it entirely would also kill the text
  // chat the plan promises (that bug locked free-plan users out
  // completely: 0 voice minutes → no session → no text questions).
  // Voice availability is signalled separately (textOnly below).
  // The plan id is also remembered for the live-model tier below.
  let memberPlanId: PlanId | null = null;
  let voiceEnabled = true;
  let voiceDisabledReason: 'plan' | 'quota' | null = null;
  if (auth.me.role !== 'admin' && !auth.fromRequest) {
    const usage = await getPlanUsage(auth.me);
    memberPlanId = usage.plan.id;
    if (!canAsk(usage)) {
      return NextResponse.json(planLimitResponse('questions', usage), {
        status: 403,
      });
    }
    const voiceLimit = usage.plan.limits.monthlyVoiceMinutes;
    if (voiceLimit === 0) {
      // プランに音声が含まれない(例外的な設定)。上限到達ではない。
      voiceEnabled = false;
      voiceDisabledReason = 'plan';
    } else if (voiceLimit !== 'unlimited') {
      const voiceSecondsUsed = await getVoiceSecondsThisMonth(auth.me);
      if (!canStartVoice(usage.plan, voiceSecondsUsed)) {
        voiceEnabled = false;
        voiceDisabledReason = 'quota';
      }
    }
  }

  // 音声が使えないユーザーには Live 接続自体を行わせない(ネイティブ
  // 音声モデルは TEXT モダリティを受け付けない)。クライアントはこの
  // フラグを見て理由を表示する。
  if (!voiceEnabled) {
    return NextResponse.json({
      textOnly: true,
      voiceEnabled: false,
      voiceDisabledReason,
    });
  }

  // Optional model override from the client's 1008-fallback loop. Only
  // accept plain model identifiers so this can't be abused to smuggle
  // arbitrary config.
  const modelOverride = sanitizeModelOverride(body.model);

  try {
    // Admins get the best available live model; members get their plan
    // tier's model (env-overridable per tier, default = the global
    // model). Gifted request-brain sessions skip the plan lookup and
    // use the default. A client model override (1008-fallback loop)
    // always wins.
    const baseModel =
      auth.me.role === 'admin'
        ? adminLiveModel(env.geminiLiveModel())
        : memberPlanId
        ? liveModelForPlan(memberPlanId, env.geminiLiveModel())
        : env.geminiLiveModel();

    const minted = await mintLiveToken(avatarId, { modelOverride, baseModel });

    // 0032: サーバー側で通話の開始を記録する(utilization の自己申告
    // 依存を減らす)。auto=true は同じ通話内の自動再接続・セッション
    // 再開なので新しい行を作らない(作ると1通話が多重計上される)。
    let voiceSessionId: string | null = null;
    if (!body.auto) {
      const { data: vsRow } = await supabaseAdmin()
        .from('voice_sessions')
        .insert({
          actor: auth.me.email,
          avatar_id: avatarId,
          seconds: 0,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      voiceSessionId = (vsRow?.id as string | undefined) ?? null;
    }

    return NextResponse.json({
      token: minted.token,
      model: minted.model,
      voice: minted.voice,
      voiceEnabled,
      voiceDisabledReason,
      voiceSessionId,
      avatar: minted.avatar,
    });
  } catch (e) {
    reportError(e, { route: 'POST /api/streaming/token', actor: auth.me.email });
    const message = e instanceof Error ? e.message : String(e);
    const status = message === 'avatar not found' ? 404 : 500;
    return NextResponse.json(
      {
        error:
          status === 404 ? 'avatar not found' : `Gemini token failed: ${message}`,
      },
      { status },
    );
  }
}
