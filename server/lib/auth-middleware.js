import { getUserFromToken } from './supabase.js';

/**
 * Hono middleware: Authorization: Bearer <access_token> から user/profile を取得
 * c.set('ctx', { id, email, profile, clientCompanyId, businessRole })
 */
export async function requireAuth(c, next) {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return c.json({ errorType: 'unauthorized', message: '認証が必要です。', error: '認証が必要です。' }, 401);
  }
  const ctx = await getUserFromToken(token);
  if (!ctx) {
    return c.json({ errorType: 'unauthorized', message: '認証トークンが無効です。', error: '認証トークンが無効です。' }, 401);
  }
  c.set('ctx', ctx);
  await next();
}

/**
 * 構造化エラーレスポンスのヘルパー
 */
export function jsonError(c, status, errorType, message, detail) {
  const body = { errorType, message, error: message };
  if (detail !== undefined) body.detail = detail;
  return c.json(body, status);
}
