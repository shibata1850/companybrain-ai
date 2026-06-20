import { NextRequest, NextResponse } from 'next/server';

/**
 * Lightweight in-process rate limiter (sliding window).
 *
 * This is a *per-instance* best-effort guard: on Vercel each serverless
 * instance keeps its own counters, so it won't perfectly coordinate a
 * burst that fans out across many cold instances. It is still a real and
 * useful first line of defence against the common cases — a single
 * client stuck in a retry loop, or one source hammering an expensive
 * Gemini / auth endpoint — at zero infrastructure cost. For globally
 * coordinated limits, swap the Map below for Upstash/Redis or a Supabase
 * table; the public API here can stay the same.
 */

type Hit = number[]; // sorted-ish list of request timestamps (ms)

const buckets = new Map<string, Hit>();

// Opportunistic cleanup so the Map can't grow unbounded on a long-lived
// warm instance. Runs at most once per CLEANUP_INTERVAL_MS.
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = 0;

function cleanup(now: number, maxWindowMs: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, hits] of buckets) {
    const fresh = hits.filter((t) => now - t < maxWindowMs);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Seconds the caller should wait before retrying (when !ok). */
  retryAfterSec: number;
  /** Requests remaining in the current window (when ok). */
  remaining: number;
};

/**
 * Record one hit for `key` and report whether it is within `limit`
 * requests per `windowMs`.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  cleanup(now, windowMs);

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    const oldest = hits[0];
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    buckets.set(key, hits); // keep pruned list
    return { ok: false, retryAfterSec, remaining: 0 };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterSec: 0, remaining: limit - hits.length };
}

/** Best-effort client identifier for unauthenticated endpoints. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/** Standard 429 response with a Retry-After header. */
export function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    {
      error:
        'リクエストが多すぎます。少し時間をおいてから再度お試しください。',
      retryAfterSec,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

/**
 * Convenience guard: returns a 429 NextResponse if over the limit, or
 * null to proceed. Usage:
 *   const limited = enforceRateLimit(`login:${ip}`, 10, 60_000);
 *   if (limited) return limited;
 */
export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const r = rateLimit(key, limit, windowMs);
  return r.ok ? null : tooManyRequests(r.retryAfterSec);
}
