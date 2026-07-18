import { ENTERPRISE_PLAN, PLANS, type Plan, type PlanId } from './plans';
import { supabaseAdmin } from './supabase';
import { quotaMonthStart } from './quota';
import type { AppUser } from './authServer';

export type PlanUsage = {
  plan: Plan;
  brainsUsed: number;
  questionsThisMonth: number;
};

/**
 * Resolve a user's current plan and tally usage against the limits
 * that matter for runtime enforcement (brain count, monthly questions).
 * Voice minutes and material size enforcement live where those events
 * actually happen.
 */
export async function getPlanUsage(user: AppUser): Promise<PlanUsage> {
  const db = supabaseAdmin();

  // Fail closed: if the plan row can't be read, refuse to silently
  // downgrade a paying user to 'free'. The caller surfaces this as
  // a 500 so the next attempt re-checks.
  // questions_reset_at(0025)が未適用の環境では plan だけで取り直す。
  type PlanRow = { plan?: string; questions_reset_at?: string | null };
  let row: PlanRow | null = null;
  let planErr: { message: string } | null = null;
  {
    const full = await db
      .from('app_users')
      .select('plan, questions_reset_at')
      .eq('email', user.email.toLowerCase())
      .single();
    if (full.error) {
      const legacy = await db
        .from('app_users')
        .select('plan')
        .eq('email', user.email.toLowerCase())
        .single();
      row = (legacy.data as unknown as PlanRow | null) ?? null;
      planErr = legacy.error;
    } else {
      row = (full.data as unknown as PlanRow | null) ?? null;
    }
  }
  if (planErr) {
    throw new Error(`plan lookup failed: ${planErr.message}`);
  }
  // 組織に所属していれば、個人プランではなくエンタープライズの
  // 「1シートあたりの上限」で制限する。個人アカウントは従来どおり。
  const inOrg = !!user.org_id;
  const planId = (row?.plan ?? 'free') as PlanId;
  const plan = inOrg ? ENTERPRISE_PLAN : PLANS.find((p) => p.id === planId) ?? PLANS[0];

  // Active brains (excludes trashed). Request-built brains (gifted by
  // an admin) are exempt from plan limits, so we never count them.
  const { count: brainsUsed } = await db
    .from('avatars')
    .select('id', { count: 'exact', head: true })
    .eq('owner_email', user.email)
    .is('deleted_at', null)
    .is('request_id', null);

  // Questions asked this month — 「質問した本人」で集計する。会話は
  // Gemini Live 経由で、1問につき role='user' の監査ログが1行残る
  // (actor はサーバー側でログイン本人のメールに上書き済み)。共有
  // ブレインで同僚が質問した分は所有者ではなくその同僚に課金される
  // ため、共有により所有者が自分のブレインから締め出される問題を防ぐ。
  // 依頼で作成された(贈与された)ブレインへの質問は従来どおり免除。
  // 月境界は JST(quotaMonthStart)。管理者が手動リセットした場合は、
  // そのリセット時刻(月初より後なら)以降の質問だけを数える。
  const monthStart = quotaMonthStart();
  const resetAt = row?.questions_reset_at
    ? new Date(row.questions_reset_at)
    : null;
  const since =
    resetAt && resetAt.getTime() > monthStart.getTime() ? resetAt : monthStart;

  // 免除対象(依頼ブレイン)の id を集め、集計から除外する。
  const { data: requestBrains } = await db
    .from('avatars')
    .select('id')
    .not('request_id', 'is', null);
  const requestBrainIds = (requestBrains ?? []).map((b) => b.id as string);

  let questionsQuery = db
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .eq('actor', user.email)
    .gte('created_at', since.toISOString());
  if (requestBrainIds.length > 0) {
    questionsQuery = questionsQuery.not(
      'avatar_id',
      'in',
      `(${requestBrainIds.join(',')})`,
    );
  }
  const { count: questionCount } = await questionsQuery;
  const questionsThisMonth = questionCount ?? 0;

  return {
    plan,
    brainsUsed: brainsUsed ?? 0,
    questionsThisMonth,
  };
}

export function canCreateBrain(usage: PlanUsage): boolean {
  const limit = usage.plan.limits.brains;
  if (limit === 'unlimited') return true;
  return usage.brainsUsed < limit;
}

export function canAsk(usage: PlanUsage): boolean {
  const limit = usage.plan.limits.monthlyQuestions;
  if (limit === 'unlimited') return true;
  return usage.questionsThisMonth < limit;
}

/* -------- Voice minute enforcement (queried on demand) ------------ */

/** Bytes used by training material on the user's OWN (non-request)
 *  brains, summed across training_videos.size_bytes. Cover photos and
 *  text snippets are negligible and intentionally not counted. */
export async function getMaterialBytesUsed(user: AppUser): Promise<number> {
  const db = supabaseAdmin();
  const { data: ownedBrains } = await db
    .from('avatars')
    .select('id')
    .eq('owner_email', user.email)
    .is('deleted_at', null)
    .is('request_id', null);
  const brainIds = (ownedBrains ?? []).map((b) => b.id as string);
  if (brainIds.length === 0) return 0;
  const { data } = await db
    .from('training_videos')
    .select('size_bytes')
    .in('avatar_id', brainIds);
  return (data ?? []).reduce(
    (sum, r) => sum + Number(r.size_bytes ?? 0),
    0,
  );
}

/** Voice seconds consumed this month, summed from voice_sessions.
 *  The month boundary is JST (quotaMonthStart). */
export async function getVoiceSecondsThisMonth(user: AppUser): Promise<number> {
  const db = supabaseAdmin();
  const monthStart = quotaMonthStart();
  const { data } = await db
    .from('voice_sessions')
    .select('seconds')
    .eq('actor', user.email)
    .gte('created_at', monthStart.toISOString());
  return (data ?? []).reduce((sum, r) => sum + Number(r.seconds ?? 0), 0);
}

/** Plan allows voice (binary check before any session opens). */
export function canStartVoice(plan: Plan, secondsUsed: number): boolean {
  const limit = plan.limits.monthlyVoiceMinutes;
  if (limit === 'unlimited') return true;
  if (limit === 0) return false;
  return secondsUsed < limit * 60;
}

/** True if (existing + new) bytes would stay within the plan's cap.
 *  Uses strict less-than to mirror canCreateBrain / canAsk semantics
 *  (i.e. "must remain strictly under the limit after this addition"). */
export function canAddMaterial(
  plan: Plan,
  existingBytes: number,
  newBytes: number,
): boolean {
  const limit = plan.limits.materialMb;
  if (limit === 'unlimited') return true;
  return existingBytes + newBytes < limit * 1024 * 1024;
}

/** Shape the upgrade nudge into a consistent response across routes. */
export function planLimitResponse(
  reason: 'brains' | 'questions' | 'voice' | 'materials',
  usage: PlanUsage,
) {
  const messages: Record<typeof reason, string> = {
    brains: `${usage.plan.name}プランのブレイン上限(${
      usage.plan.limits.brains === 'unlimited'
        ? '無制限'
        : `${usage.plan.limits.brains}個`
    })に達しました。`,
    questions: `${usage.plan.name}プランの月間質問上限(${
      usage.plan.limits.monthlyQuestions === 'unlimited'
        ? '無制限'
        : `${usage.plan.limits.monthlyQuestions.toLocaleString()}回`
    })に達しました。`,
    voice: `${usage.plan.name}プランの音声会話上限に達しました。`,
    materials: `${usage.plan.name}プランの素材容量上限に達しました。`,
  };
  return {
    error: messages[reason],
    code: 'plan_limit_exceeded',
    plan: usage.plan.id,
    upgrade_to:
      usage.plan.id === 'pro' || usage.plan.id === 'enterprise'
        ? null
        : nextPlanId(usage.plan.id),
  };
}

function nextPlanId(current: PlanId): PlanId {
  const order: PlanId[] = ['free', 'starter', 'standard', 'pro'];
  const i = order.indexOf(current);
  return order[Math.min(i + 1, order.length - 1)];
}

/**
 * Concrete Gemini model id per plan. Each tier is independently
 * overridable via an environment variable, so the top tier can be
 * pointed at a newer/better model (e.g. a future Gemini 3.x) the
 * moment its real model id is confirmed in Google AI Studio — no code
 * change or redeploy needed, just set the env var in Vercel.
 *
 * Defaults below use only model ids confirmed to exist. Do NOT invent
 * ids here; set them via env once verified.
 *
 *   GEMINI_MODEL_FREE      (default: gemini-2.5-flash)
 *   GEMINI_MODEL_STARTER   (default: gemini-2.5-flash)
 *   GEMINI_MODEL_STANDARD  (default: gemini-2.5-pro)
 *   GEMINI_MODEL_PRO       (default: gemini-2.5-pro)  ← set to the
 *                          newest top model when available
 */
function modelForPlanId(id: PlanId): string {
  switch (id) {
    case 'enterprise':
      // 企業向けは最上位。専用 env が無ければ Pro 相当にフォールバック。
      return (
        process.env.GEMINI_MODEL_ENTERPRISE ||
        process.env.GEMINI_MODEL_PRO ||
        'gemini-2.5-pro'
      );
    case 'pro':
      return process.env.GEMINI_MODEL_PRO || 'gemini-2.5-pro';
    case 'standard':
      return process.env.GEMINI_MODEL_STANDARD || 'gemini-2.5-pro';
    case 'starter':
      return process.env.GEMINI_MODEL_STARTER || 'gemini-2.5-flash';
    case 'free':
    default:
      return process.env.GEMINI_MODEL_FREE || 'gemini-2.5-flash';
  }
}

/** Map the plan to a concrete Gemini model id (env-overridable). */
export function answerModelForPlan(plan: Plan): string {
  return modelForPlanId(plan.id);
}

/**
 * Highest-quality answer model — used for admins, who always get the
 * best available regardless of plan. Defaults to the same id as the Pro
 * tier (gemini-2.5-pro) and is overridable via GEMINI_MODEL_ADMIN, then
 * GEMINI_MODEL_PRO.
 */
export function adminAnswerModel(): string {
  return (
    process.env.GEMINI_MODEL_ADMIN ||
    process.env.GEMINI_MODEL_PRO ||
    'gemini-2.5-pro'
  );
}

/**
 * Live (voice) model for admins — the best available. Falls back to the
 * supplied default live model so behaviour is unchanged unless a
 * premium live model id is set via GEMINI_LIVE_MODEL_ADMIN.
 */
export function adminLiveModel(fallback: string): string {
  return process.env.GEMINI_LIVE_MODEL_ADMIN || fallback;
}

/**
 * Live (voice/text) model per plan tier. All real conversations run
 * over Gemini Live (/api/streaming/token), so THIS — not
 * answerModelForPlan — is what actually differentiates model quality
 * between plans. Each tier is env-overridable:
 *
 *   GEMINI_LIVE_MODEL_FREE / _STARTER / _STANDARD / _PRO
 *
 * Until those are set in Vercel, every tier falls back to the global
 * default (GEMINI_LIVE_MODEL), i.e. behaviour is unchanged. Only set
 * model ids confirmed to exist on the v1alpha Live API.
 */
export function liveModelForPlan(planId: PlanId, fallback: string): string {
  const byTier: Record<PlanId, string | undefined> = {
    free: process.env.GEMINI_LIVE_MODEL_FREE,
    starter: process.env.GEMINI_LIVE_MODEL_STARTER,
    standard: process.env.GEMINI_LIVE_MODEL_STANDARD,
    pro: process.env.GEMINI_LIVE_MODEL_PRO,
    enterprise:
      process.env.GEMINI_LIVE_MODEL_ENTERPRISE || process.env.GEMINI_LIVE_MODEL_PRO,
  };
  return byTier[planId] || fallback;
}
