import { describe, it, expect } from 'vitest';
import { PLANS, type PlanId } from './plans';

describe('PLANS catalog', () => {
  it('defines exactly the four known tiers in ascending price order', () => {
    const ids = PLANS.map((p) => p.id);
    expect(ids).toEqual(['free', 'starter', 'standard', 'pro']);
    const prices = PLANS.map((p) => p.priceJpy);
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });

  it('has no duplicate ids', () => {
    const ids = PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('free tier is genuinely free and includes a small voice trial', () => {
    const free = PLANS.find((p) => p.id === 'free')!;
    expect(free.priceJpy).toBe(0);
    // Free now gets a small monthly voice trial so users can experience
    // the headline feature before upgrading (API cost is absorbed).
    expect(free.limits.monthlyVoiceMinutes).toBe(15);
  });

  it('every plan has complete, sane limits', () => {
    for (const p of PLANS) {
      const l = p.limits;
      for (const key of [
        'brains',
        'monthlyQuestions',
        'monthlyVoiceMinutes',
        'materialMb',
        'historyDays',
      ] as const) {
        const v = l[key];
        expect(v === 'unlimited' || (typeof v === 'number' && v >= 0)).toBe(
          true,
        );
      }
      expect(['flash', 'pro', 'pro-2.5']).toContain(l.modelTier);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.features.length).toBeGreaterThan(0);
    }
  });

  it('higher tiers never offer fewer brains than lower tiers', () => {
    const order: PlanId[] = ['free', 'starter', 'standard', 'pro'];
    const brainsOf = (id: PlanId) => {
      const v = PLANS.find((p) => p.id === id)!.limits.brains;
      return v === 'unlimited' ? Number.POSITIVE_INFINITY : v;
    };
    for (let i = 1; i < order.length; i++) {
      expect(brainsOf(order[i])).toBeGreaterThanOrEqual(brainsOf(order[i - 1]));
    }
  });
});
