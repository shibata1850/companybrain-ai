import { getUserCtxFromToken } from './context.js';

/**
 * Hono middleware: Authorization: Bearer <JWT> から ctx を取得
 */
export async function requireAuth(c, next) {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return c.json({ errorType: 'unauthorized', message: '認証が必要です。', error: '認証が必要です。' }, 401);
  }
  const ctx = await getUserCtxFromToken(token);
  if (!ctx) {
    return c.json({ errorType: 'unauthorized', message: '認証トークンが無効です。', error: '認証トークンが無効です。' }, 401);
  }
  c.set('ctx', ctx);
  await next();
}

export function jsonError(c, status, errorType, message, detail) {
  const body = { errorType, message, error: message };
  if (detail !== undefined) body.detail = detail;
  return c.json(body, status);
}
