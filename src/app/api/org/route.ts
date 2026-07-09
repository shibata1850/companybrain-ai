import { NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { getOrg, listOrgMembers } from '@/lib/org';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 会社管理者(org_role='company_admin')が見る自社の情報:
 * 組織名・シート使用状況・メンバー一覧。運営者(role='admin')でも
 * 自身が組織に属していれば見られる。
 */
export async function GET() {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!me.org_id || me.org_role !== 'company_admin') {
    return NextResponse.json({ error: 'not_company_admin' }, { status: 403 });
  }
  const org = await getOrg(me.org_id);
  if (!org) {
    return NextResponse.json({ error: '組織が見つかりません' }, { status: 404 });
  }
  const members = await listOrgMembers(me.org_id);
  return NextResponse.json({
    org: {
      id: org.id,
      name: org.name,
      seats: org.seats,
      used: members.length,
    },
    members,
  });
}
