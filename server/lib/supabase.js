/**
 * Supabase server-side client（service_role キー使用）
 * RLS をバイパスして全テーブルにアクセス可能なので、
 * このクライアントは絶対にフロントに渡してはいけません。
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. Backend will fail at runtime.');
}

export const supabaseAdmin = createClient(url || '', serviceRoleKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * フロントから渡された access_token を検証して、ユーザー情報と user_profile を返す。
 */
export async function getUserFromToken(accessToken) {
  if (!accessToken) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .eq('user_id', data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email,
    user: data.user,
    profile: profile || null,
    clientCompanyId: profile?.client_company_id || null,
    businessRole: profile?.business_role || 'viewer',
  };
}

/**
 * テナント検証ヘルパー（softdoing_admin は常に true）
 */
export function isGlobalAdmin(ctx) {
  return ctx?.businessRole === 'softdoing_admin';
}

export function assertTenantAccess(ctx, targetClientCompanyId) {
  if (!ctx) return { ok: false, code: 401, errorType: 'unauthorized', message: '認証が必要です。' };
  if (isGlobalAdmin(ctx)) return { ok: true };
  if (!ctx.clientCompanyId) {
    return { ok: false, code: 403, errorType: 'missing_user_company', message: 'ユーザーに clientCompanyId が設定されていません。' };
  }
  if (String(ctx.clientCompanyId) !== String(targetClientCompanyId || '')) {
    return { ok: false, code: 403, errorType: 'tenant_mismatch', message: '他社データにアクセスできません。' };
  }
  return { ok: true };
}
