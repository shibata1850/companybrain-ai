import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';
import { countOrgMembers, getOrg } from '@/lib/org';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 運営者が既存ユーザーを組織に割り当てる(主に「会社管理者」の任命)。
 * 会社管理者は以後、自社メンバーをシート内で招待・管理できる。
 * Body: { email, org_id, org_role: 'company_admin' | 'member' }
 *   org_id を null にすると組織から外す(個人アカウントに戻す)。
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { email, org_id, org_role } = (await req.json().catch(() => ({}))) as {
    email?: string;
    org_id?: string | null;
    org_role?: string;
  };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }
  const db = supabaseAdmin();

  // 組織から外す。
  if (!org_id) {
    const { error } = await db
      .from('app_users')
      .update({ org_id: null, org_role: null })
      .eq('email', cleanEmail);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const org = await getOrg(org_id);
  if (!org) {
    return NextResponse.json({ error: '組織が見つかりません' }, { status: 404 });
  }
  const role = org_role === 'company_admin' ? 'company_admin' : 'member';

  // 対象は事前に「ユーザー管理」で登録済みである必要がある。存在しない
  // メールをサイレント成功にしない。
  const { data: current } = await db
    .from('app_users')
    .select('org_id')
    .eq('email', cleanEmail)
    .single();
  if (!current) {
    return NextResponse.json(
      { error: 'そのユーザーは未登録です。先に「ユーザー管理」で追加してください。' },
      { status: 404 },
    );
  }
  const alreadyInThisOrg = current.org_id === org_id;
  if (!alreadyInThisOrg) {
    const used = await countOrgMembers(org_id);
    if (used >= org.seats) {
      return NextResponse.json(
        { error: `シートが上限(${org.seats})に達しています。シート数を増やしてください。` },
        { status: 400 },
      );
    }
  }

  const { error } = await db
    .from('app_users')
    .update({ org_id, org_role: role })
    .eq('email', cleanEmail);
  if (error) {
    if (/seat limit exceeded/.test(error.message)) {
      return NextResponse.json(
        { error: 'シートが上限に達しています。シート数を増やしてください。' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
