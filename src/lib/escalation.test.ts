import { describe, it, expect } from 'vitest';
import { detectEscalation, escalationLabel } from './escalation';

describe('detectEscalation', () => {
  it('returns null for an innocuous question', () => {
    expect(detectEscalation('明日の天気は何ですか?')).toBeNull();
  });

  it('flags concrete money amounts', () => {
    const f = detectEscalation('この案件、500万円で受けても大丈夫?');
    expect(f).not.toBeNull();
    expect(f!.categories).toContain('money');
  });

  it('flags comma-formatted yen amounts', () => {
    const f = detectEscalation('請求は1,200,000円でいいですか');
    expect(f!.categories).toContain('money');
  });

  it('flags contract / approval language', () => {
    const f = detectEscalation('この契約を締結して問題ないですか');
    expect(f!.categories).toEqual(
      expect.arrayContaining(['contract', 'decision']),
    );
  });

  it('flags complaints and compensation', () => {
    const f = detectEscalation('お客様から異物混入のクレーム。返金すべき?');
    expect(f!.categories).toEqual(
      expect.arrayContaining(['complaint']),
    );
  });

  it('flags personnel decisions', () => {
    const f = detectEscalation('彼を解雇しても大丈夫でしょうか');
    expect(f!.categories).toEqual(
      expect.arrayContaining(['personnel', 'decision']),
    );
  });

  it('normalizes full-width input (NFKC) before matching', () => {
    // Full-width digits / percent should still match the money rules.
    const f = detectEscalation('３０％オフにしてもいい?');
    expect(f).not.toBeNull();
  });

  it('caps hints at 6 entries', () => {
    const f = detectEscalation(
      '契約 与信 発注 決裁 融資 クレーム 賠償 返金 解雇 採用 違法',
    );
    expect(f!.hints.length).toBeLessThanOrEqual(6);
  });

  it('dedupes categories across multiple matches', () => {
    const f = detectEscalation('値引きと減額、さらにディスカウント');
    expect(f!.categories.filter((c) => c === 'money').length).toBe(1);
  });
});

describe('escalationLabel', () => {
  it('maps every category to a non-empty Japanese label', () => {
    for (const c of [
      'money',
      'contract',
      'complaint',
      'personnel',
      'compliance',
      'decision',
    ] as const) {
      expect(escalationLabel(c).length).toBeGreaterThan(0);
    }
  });
});
