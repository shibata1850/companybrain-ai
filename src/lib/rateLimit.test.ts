import { describe, it, expect } from 'vitest';
import { rateLimit } from './rateLimit';

describe('rateLimit', () => {
  it('allows up to the limit then blocks', () => {
    const key = `t1:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 10_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 10_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('reports decreasing remaining count', () => {
    const key = `t2:${Math.random()}`;
    expect(rateLimit(key, 5, 10_000).remaining).toBe(4);
    expect(rateLimit(key, 5, 10_000).remaining).toBe(3);
  });

  it('keeps separate keys independent', () => {
    const a = `t3a:${Math.random()}`;
    const b = `t3b:${Math.random()}`;
    expect(rateLimit(a, 1, 10_000).ok).toBe(true);
    expect(rateLimit(a, 1, 10_000).ok).toBe(false);
    expect(rateLimit(b, 1, 10_000).ok).toBe(true); // b unaffected by a
  });

  it('frees up the window after it elapses', async () => {
    const key = `t4:${Math.random()}`;
    expect(rateLimit(key, 1, 30).ok).toBe(true);
    expect(rateLimit(key, 1, 30).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 45));
    expect(rateLimit(key, 1, 30).ok).toBe(true); // window cleared
  });
});
