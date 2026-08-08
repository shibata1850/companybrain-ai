/**
 * Dependency-free error reporting.
 *
 * Every server-side failure we care about is funneled through
 * `reportError`, which (1) always emits a single structured line to
 * stderr (visible in Vercel's function logs) and (2) optionally fans the
 * event out to an incoming webhook if `ERROR_WEBHOOK_URL` is configured.
 *
 * The webhook payload includes both `text` (Slack) and `content`
 * (Discord) so either platform's incoming webhook renders it without
 * extra config. Reporting is fire-and-forget and never throws, so a
 * monitoring outage can never break a request.
 *
 * To upgrade to a full APM later (Sentry etc.), swap the body of
 * `reportError` — call sites don't need to change.
 */

export type ErrorContext = {
  /** Where it happened, e.g. "POST /api/avatars". */
  route?: string;
  /** Acting user (email) if known — helps triage without PII digging. */
  actor?: string | null;
  /** Any extra structured fields worth capturing. */
  [key: string]: unknown;
};

function redact(value: string): string {
  // Strip anything that looks like a key/token so secrets never reach
  // the log line or the webhook.
  return value
    .replace(/(key|token|secret|password|authorization)["']?\s*[:=]\s*["']?[\w.\-]+/gi, '$1=[redacted]')
    .replace(/AIza[\w\-]{20,}/g, '[redacted-key]')
    .replace(/eyJ[\w\-]+\.[\w\-]+\.[\w\-]+/g, '[redacted-jwt]');
}

/**
 * 同一エラーの連投を抑える。障害時は同じ例外が毎リクエスト発生するため、
 * 素通しにすると Slack/Discord が埋まり、レート制限にも当たって肝心の
 * 通知が届かなくなる。同じ内容は既定10分に1回だけ送り、その間に何回
 * 起きたかは次回の通知に添える。
 */
const WEBHOOK_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED_KEYS = 200;
const notified = new Map<string, { at: number; suppressed: number }>();

function shouldNotify(key: string): { send: boolean; suppressed: number } {
  const now = Date.now();
  const prev = notified.get(key);
  if (prev && now - prev.at < WEBHOOK_WINDOW_MS) {
    prev.suppressed += 1;
    return { send: false, suppressed: prev.suppressed };
  }
  // メモリが無限に増えないよう、古い記録から捨てる。
  if (notified.size >= MAX_TRACKED_KEYS) {
    const oldest = [...notified.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) notified.delete(oldest[0]);
  }
  const suppressed = prev?.suppressed ?? 0;
  notified.set(key, { at: now, suppressed: 0 });
  return { send: true, suppressed };
}

export function reportError(error: unknown, context: ErrorContext = {}): void {
  const message = redact(
    error instanceof Error ? error.message : String(error),
  );
  const stack =
    error instanceof Error && error.stack ? redact(error.stack) : undefined;

  const record = {
    level: 'error' as const,
    at: new Date().toISOString(),
    message,
    ...context,
  };

  // (1) Structured stderr line — always.
  try {
    console.error('[error-report]', JSON.stringify(record));
  } catch {
    console.error('[error-report]', message);
  }

  // (2) Optional webhook fan-out — best effort, never awaited by callers.
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;

  // 同一エラーの連投を抑制(障害時のスパムとレート制限を防ぐ)。
  const { send, suppressed } = shouldNotify(`${context.route ?? 'app'}|${message}`);
  if (!send) return;

  const summary =
    `:rotating_light: ${context.route ?? 'app'} — ${message}` +
    (context.actor ? ` (actor: ${context.actor})` : '') +
    (suppressed > 0 ? `\n(直前の10分間に同じエラーが ${suppressed} 件発生)` : '');
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: summary,
      content: summary,
      attachments: [{ text: JSON.stringify({ ...record, stack }) }],
    }),
  }).catch(() => {
    // Monitoring must never break the request path.
  });
}
