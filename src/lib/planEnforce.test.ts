import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  canCreateBrain,
  canAsk,
  canStartVoice,
  canAddMaterial,
  answerModelForPlan,
  adminAnswerModel,
  adminLiveModel,
  type PlanUsage,
} from './planEnforce';
import { PLANS, type Plan } from './plans';

const planById = (id: string): Plan => PLANS.find((p) => p.id === id)!;

const usageFor = (
  id: string,
  over: Partial<PlanUsage> = {},
): PlanUsage => ({
  plan: planById(id),
  brainsUsed: 0,
  questionsThisMonth: 0,
  trialUntil: null,
  ...over,
});

describe('canCreateBrain', () => {
  it('blocks when at the free-tier cap', () => {
    expect(canCreateBrain(usageFor('free', { brainsUsed: 1 }))).toBe(false);
  });
  it('allows when under the cap', () => {
    expect(canCreateBrain(usageFor('free', { brainsUsed: 0 }))).toBe(true);
  });
  it('allows unlimited tiers regardless of count', () => {
    const pro = usageFor('pro', { brainsUsed: 9999 });
    // pro may be a finite number or 'unlimited'; assert against its own limit.
    const limit = pro.plan.limits.brains;
    const expected = limit === 'unlimited' ? true : 9999 < limit;
    expect(canCreateBrain(pro)).toBe(expected);
  });
});

describe('canAsk', () => {
  it('blocks at the monthly question cap', () => {
    const free = planById('free');
    const cap =
      free.limits.monthlyQuestions === 'unlimited'
        ? 1
        : free.limits.monthlyQuestions;
    expect(canAsk(usageFor('free', { questionsThisMonth: cap }))).toBe(false);
  });
  it('allows below the cap', () => {
    expect(canAsk(usageFor('free', { questionsThisMonth: 0 }))).toBe(true);
  });
});

describe('canStartVoice', () => {
  it('allows the free voice trial, then blocks once the cap is reached', () => {
    const free = planById('free');
    const mins = free.limits.monthlyVoiceMinutes;
    expect(mins).toBe(15); // free voice trial
    if (mins === 'unlimited') return;
    expect(canStartVoice(free, 0)).toBe(true); // trial available
    expect(canStartVoice(free, mins * 60)).toBe(false); // exhausted
  });
  it('denies once the per-month second budget is exhausted', () => {
    const starter = planById('starter');
    const mins = starter.limits.monthlyVoiceMinutes;
    if (mins === 'unlimited' || mins === 0) return; // not applicable
    expect(canStartVoice(starter, mins * 60)).toBe(false); // exactly at cap
    expect(canStartVoice(starter, mins * 60 - 1)).toBe(true); // just under
  });
});

describe('canAddMaterial', () => {
  const starter = planById('starter');
  const cap =
    starter.limits.materialMb === 'unlimited'
      ? null
      : starter.limits.materialMb * 1024 * 1024;

  it('allows an addition that stays strictly under the cap', () => {
    if (cap === null) return;
    expect(canAddMaterial(starter, cap - 1024, 512)).toBe(true);
  });
  it('blocks an addition that reaches or exceeds the cap', () => {
    if (cap === null) return;
    expect(canAddMaterial(starter, cap, 1)).toBe(false);
    expect(canAddMaterial(starter, cap - 1, 1)).toBe(false); // == cap
  });
});

describe('model selection', () => {
  const ENV_KEYS = [
    'GEMINI_MODEL_ADMIN',
    'GEMINI_MODEL_PRO',
    'GEMINI_LIVE_MODEL_ADMIN',
  ];
  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it('answerModelForPlan returns a non-empty model id for every plan', () => {
    for (const p of PLANS) {
      expect(answerModelForPlan(p).length).toBeGreaterThan(0);
    }
  });

  it('adminAnswerModel prefers ADMIN > PRO > default', () => {
    expect(adminAnswerModel()).toBe('gemini-2.5-pro');
    process.env.GEMINI_MODEL_PRO = 'pro-override';
    expect(adminAnswerModel()).toBe('pro-override');
    process.env.GEMINI_MODEL_ADMIN = 'admin-override';
    expect(adminAnswerModel()).toBe('admin-override');
  });

  it('adminLiveModel uses the env override when present, else the fallback', () => {
    expect(adminLiveModel('fallback-live')).toBe('fallback-live');
    process.env.GEMINI_LIVE_MODEL_ADMIN = 'admin-live';
    expect(adminLiveModel('fallback-live')).toBe('admin-live');
  });
});

describe('体験(トライアル)のプラン解決', () => {
  /**
   * 営業が付与する14日体験は課金に直結するため、適用条件を固定する:
   * 期限内の個人 → trial_plan / 期限切れ → 本来のプラン /
   * 組織所属者 → シート上限が優先(体験は効かない)。
   */
  function makeDb(userRow: Record<string, unknown>) {
    const builder = () => {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      for (const m of ['select', 'eq', 'is', 'in', 'gte', 'not', 'order', 'limit', 'range']) {
        b[m] = chain;
      }
      b.single = async () => ({ data: userRow, error: null });
      // count クエリ(ブレイン数・質問数)は 0 で返す
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: [], count: 0, error: null });
      return b;
    };
    return { from: builder, rpc: async () => ({ data: [], error: null }) };
  }

  async function usageWith(userRow: Record<string, unknown>, orgId?: string) {
    vi.resetModules();
    vi.doMock('./supabase', () => ({ supabaseAdmin: () => makeDb(userRow) }));
    const { getPlanUsage } = await import('./planEnforce');
    return getPlanUsage({
      email: 'test@example.com',
      role: 'member',
      org_id: orgId ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  afterEach(() => {
    vi.doUnmock('./supabase');
    vi.resetModules();
  });

  it('期限内の体験は trial_plan の上限で動作する', async () => {
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const usage = await usageWith({
      plan: 'free',
      trial_plan: 'standard',
      trial_until: until,
    });
    expect(usage.plan.id).toBe('standard');
    expect(usage.trialUntil).toBe(until);
  });

  it('期限切れの体験は無視され、本来のプランに戻る', async () => {
    const usage = await usageWith({
      plan: 'free',
      trial_plan: 'standard',
      trial_until: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect(usage.plan.id).toBe('free');
    expect(usage.trialUntil).toBeNull();
  });

  it('組織所属者はシート上限が優先(体験は効かない)', async () => {
    const usage = await usageWith(
      {
        plan: 'free',
        trial_plan: 'standard',
        trial_until: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      },
      'org-1',
    );
    expect(usage.plan.id).toBe('enterprise');
    // 席上限の整備(2026-08 決定)が効いていることも固定する
    expect(usage.plan.limits.monthlyQuestions).toBe(1000);
    expect(usage.plan.limits.monthlyVoiceMinutes).toBe(180);
    expect(usage.plan.limits.brains).toBe(10);
  });
});
