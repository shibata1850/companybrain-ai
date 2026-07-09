import { supabaseAdmin } from './supabase';

export type OrgRecord = {
  id: string;
  name: string;
  plan: string;
  seats: number;
  seat_price_jpy: number | null;
  created_at: string;
};

export type OrgMember = {
  email: string;
  org_role: 'company_admin' | 'member';
  suspended_at: string | null;
  created_at: string;
};

/** 組織1件を取得。 */
export async function getOrg(orgId: string): Promise<OrgRecord | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('organizations')
    .select('id, name, plan, seats, seat_price_jpy, created_at')
    .eq('id', orgId)
    .single();
  return (data as OrgRecord | null) ?? null;
}

/** 組織に所属するメンバー一覧(会社管理者を含む)。 */
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('app_users')
    .select('email, org_role, suspended_at, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });
  return ((data ?? []) as OrgMember[]).map((m) => ({
    ...m,
    org_role: m.org_role === 'company_admin' ? 'company_admin' : 'member',
  }));
}

/** 組織のシート使用数(所属メンバー数=会社管理者含む)。 */
export async function countOrgMembers(orgId: string): Promise<number> {
  const db = supabaseAdmin();
  const { count } = await db
    .from('app_users')
    .select('email', { count: 'exact', head: true })
    .eq('org_id', orgId);
  return count ?? 0;
}
