import { describe, it, expect, afterEach } from 'vitest';
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
