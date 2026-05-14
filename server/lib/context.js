/**
 * ユーザーコンテキストとテナント検証
 */
import { db, fromBool } from './db.js';
import { verifySessionToken } from './auth.js';

/**
 * Bearer トークンから user + profile を取得
 */
export async function getUserCtxFromToken(token) {
  const decoded = await verifySessionToken(token);
  if (!decoded) return null;

  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(decoded.userId);
  if (!user) return null;

  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(user.id);

  return {
    id: user.id,
    email: user.email,
    profile: profile || null,
    clientCompanyId: profile?.client_company_id || null,
    businessRole: profile?.business_role || 'viewer',
    displayName: profile?.display_name || null,
    department: profile?.department || null,
  };
}

export function isGlobalAdmin(ctx) {
  return ctx?.businessRole === 'softdoing_admin';
}

export function assertTenantAccess(ctx, targetClientCompanyId) {
  if (!ctx) return { ok: false, code: 401, errorType: 'unauthorized', message: '認証が必要です。' };
  if (isGlobalAdmin(ctx)) return { ok: true };
  if (!ctx.clientCompanyId) {
    return { ok: false, code: 403, errorType: 'missing_user_company', message: 'ユーザーに会社が紐付いていません。' };
  }
  if (String(ctx.clientCompanyId) !== String(targetClientCompanyId || '')) {
    return { ok: false, code: 403, errorType: 'tenant_mismatch', message: '他社データにアクセスできません。' };
  }
  return { ok: true };
}
