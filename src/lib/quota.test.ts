import { describe, expect, it } from 'vitest';
import { quotaMonthStart } from './quota';

describe('quotaMonthStart', () => {
  it('月の途中では、その月の1日 0:00 JST を返す', () => {
    // 2026-07-15 12:00 JST = 2026-07-15T03:00:00Z
    const now = new Date('2026-07-15T03:00:00Z');
    expect(quotaMonthStart(now).toISOString()).toBe(
      '2026-06-30T15:00:00.000Z', // = 2026-07-01 00:00 JST
    );
  });

  it('JSTの月初 0:00 ちょうどで新しい月に切り替わる', () => {
    // 2026-08-01 00:00 JST = 2026-07-31T15:00:00Z
    const now = new Date('2026-07-31T15:00:00Z');
    expect(quotaMonthStart(now).toISOString()).toBe(
      '2026-07-31T15:00:00.000Z',
    );
  });

  it('JSTの月初直前(UTCでは既に翌月1日)はまだ前月扱い', () => {
    // 2026-08-01 08:59 UTC ... いや逆: 2026-07-31 23:59 JST = 2026-07-31T14:59:00Z
    const now = new Date('2026-07-31T14:59:00Z');
    expect(quotaMonthStart(now).toISOString()).toBe(
      '2026-06-30T15:00:00.000Z', // まだ7月分(7/1 0:00 JST 起点)
    );
  });

  it('年またぎ: 1月中は 1/1 0:00 JST を返す', () => {
    // 2027-01-01 05:00 JST = 2026-12-31T20:00:00Z
    const now = new Date('2026-12-31T20:00:00Z');
    expect(quotaMonthStart(now).toISOString()).toBe(
      '2026-12-31T15:00:00.000Z', // = 2027-01-01 00:00 JST
    );
  });
});
