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
  const summary =
    `:rotating_light: ${context.route ?? 'app'} — ${message}` +
    (context.actor ? ` (actor: ${context.actor})` : '');
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
