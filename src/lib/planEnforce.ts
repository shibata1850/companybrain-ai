import { PLANS, type Plan, type PlanId } from './plans';
import { supabaseAdmin } from './supabase';
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
  const { data: row, error: planErr } = await db
    .from('app_users')
    .select('plan')
    .eq('email', user.email.toLowerCase())
    .single();
  if (planErr) {
    throw new Error(`plan lookup failed: ${planErr.message}`);
  }
  const planId = (row?.plan ?? 'free') as PlanId;
  const plan = PLANS.find((p) => p.id === planId) ?? PLANS[0];

  // Active brains (excludes trashed). Request-built brains (gifted by
  // an admin) are exempt from plan limits, so we never count them.
  const { count: brainsUsed } = await db
    .from('avatars')
    .select('id', { count: 'exact', head: true })
    .eq('owner_email', user.email)
    .is('deleted_at', null)
    .is('request_id', null);

  // Questions asked this month — only across the user's OWN (non-request)
  // brains; questions to gifted request-brains don't count.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Own (non-request) brains — questions to gifted request-brains are
  // exempt, so we only count activity on these.
  const { data: ownedBrains } = await db
    .from('avatars')
    .select('id')
    .eq('owner_email', user.email)
    .is('request_id', null);
  const brainIds = (ownedBrains ?? []).map((b) => b.id as string);

  // Questions asked this month. Conversations run over Gemini Live and
  // are recorded in audit_logs (one role='user' row per question), NOT
  // in `generations` (the /ask route is unused). Count those.
  let questionsThisMonth = 0;
  if (brainIds.length > 0) {
    const { count } = await db
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'user')
      .in('avatar_id', brainIds)
      .gte('created_at', monthStart.toISOString());
    questionsThisMonth = count ?? 0;
  }

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

/** Voice seconds consumed this month, summed from voice_sessions. */
export async function getVoiceSecondsThisMonth(user: AppUser): Promise<number> {
  const db = supabaseAdmin();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
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
    upgrade_to: usage.plan.id === 'pro' ? null : nextPlanId(usage.plan.id),
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
