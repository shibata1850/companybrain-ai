import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit } from '@/lib/rateLimit';
import { countOrgMembers, getOrg } from '@/lib/org';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 会社管理者が自社メンバーを招待・停止・削除する(自組織のみ)。

async function requireCompanyAdmin() {
  const me = await getAppUser();
  if (!me || !me.org_id || me.org_role !== 'company_admin') return null;
  return me;
}

/** メンバー招待。シート上限内で allowlist + 認証アカウントを作る。
 *  Body: { email, password } */
export async function POST(req: NextRequest) {
  const me = await requireCompanyAdmin();
  if (!me) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = enforceRateLimit(`org-invite:${me.email}`, 20, 60_000);
  if (limited) return limited;

  const { email, password } = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail || !password || password.length < 8) {
    return NextResponse.json(
      { error: 'メールアドレスと8文字以上のパスワードが必要です' },
      { status: 400 },
    );
  }

  const org = await getOrg(me.org_id!);
  if (!org) return NextResponse.json({ error: '組織が見つかりません' }, { status: 404 });

  const db = supabaseAdmin();

  // 既存アカウントの状態で分岐。他人のアカウント(個人・別組織・運営者)を
  // 無断で自組織に取り込む/役割を書き換えることは一切しない。
  const { data: existing } = await db
    .from('app_users')
    .select('role, org_id, org_role, suspended_at')
    .eq('email', cleanEmail)
    .single();

  if (existing) {
    // 別組織・運営者・自組織と無関係の個人アカウントは取り込めない。
    if (existing.role === 'admin') {
      return NextResponse.json(
        { error: 'このメールアドレスは運営者アカウントのため招待できません。' },
        { status: 400 },
      );
    }
    if (!existing.org_id) {
      return NextResponse.json(
        { error: 'このメールアドレスは既に個人アカウントとして登録されています。別のアドレスをご利用ください。' },
        { status: 400 },
      );
    }
    if (existing.org_id !== me.org_id) {
      return NextResponse.json(
        { error: 'このメールアドレスは既に別の組織に所属しています。' },
        { status: 400 },
      );
    }
    // 自組織の既存メンバー = 再有効化のみ。役割(会社管理者含む)は変えない。
    if (existing.suspended_at) {
      const { error } = await db
        .from('app_users')
        .update({ suspended_at: null })
        .eq('email', cleanEmail);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, reactivated: true });
  }

  // 新規メンバー。シート事前チェック(DBトリガーが上限を最終保証)。
  const used = await countOrgMembers(me.org_id!);
  if (used >= org.seats) {
    return NextResponse.json(
      { error: `シートが上限(${org.seats})に達しています。運営者にシート追加を依頼してください。` },
      { status: 400 },
    );
  }

  const { error: createErr } = await db.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
  });
  if (createErr && !/already|exists|registered/i.test(createErr.message)) {
    return NextResponse.json({ error: createErr.message }, { status: 500 });
  }

  const { error: insErr } = await db
    .from('app_users')
    .insert({
      email: cleanEmail,
      role: 'member',
      org_id: me.org_id,
      org_role: 'member',
    });
  if (insErr) {
    // DBトリガーによるシート超過は分かりやすい文言にする。
    if (/seat limit exceeded/.test(insErr.message)) {
      return NextResponse.json(
        { error: 'シートが上限に達しています。運営者にシート追加を依頼してください。' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** メンバーの停止/再開。Body: { email, suspend } */
export async function PATCH(req: NextRequest) {
  const me = await requireCompanyAdmin();
  if (!me) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { email, suspend } = (await req.json().catch(() => ({}))) as {
    email?: string;
    suspend?: boolean;
  };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) return NextResponse.json({ error: 'email required' }, { status: 400 });
  if (cleanEmail === me.email.toLowerCase()) {
    return NextResponse.json({ error: '自分自身は操作できません' }, { status: 400 });
  }

  const db = supabaseAdmin();
  // 自組織のメンバーであることを担保。会社管理者どうしは操作不可
  // (会社管理者の任命・解除は運営者のみ)。
  const { data: target } = await db
    .from('app_users')
    .select('org_id, org_role')
    .eq('email', cleanEmail)
    .single();
  if (!target || target.org_id !== me.org_id) {
    return NextResponse.json({ error: 'このユーザーは自社のメンバーではありません' }, { status: 403 });
  }
  if (target.org_role === 'company_admin') {
    return NextResponse.json(
      { error: '会社管理者は操作できません。運営者にご連絡ください。' },
      { status: 403 },
    );
  }
  const { error } = await db
    .from('app_users')
    .update({ suspended_at: suspend ? new Date().toISOString() : null })
    .eq('email', cleanEmail);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** メンバーを組織から外す(シートを空ける)。認証アカウントは残し、
 *  allowlist の org 所属を解除して停止する。Body: { email } */
export async function DELETE(req: NextRequest) {
  const me = await requireCompanyAdmin();
  if (!me) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) return NextResponse.json({ error: 'email required' }, { status: 400 });
  if (cleanEmail === me.email.toLowerCase()) {
    return NextResponse.json({ error: '自分自身は外せません' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: target } = await db
    .from('app_users')
    .select('org_id, org_role')
    .eq('email', cleanEmail)
    .single();
  if (!target || target.org_id !== me.org_id) {
    return NextResponse.json({ error: 'このユーザーは自社のメンバーではありません' }, { status: 403 });
  }
  if (target.org_role === 'company_admin') {
    return NextResponse.json(
      { error: '会社管理者は外せません。運営者にご連絡ください。' },
      { status: 403 },
    );
  }
  // 組織から外し、ログインを止める(完全削除は運営者のみが行える)。
  const { error } = await db
    .from('app_users')
    .update({ org_id: null, org_role: null, suspended_at: new Date().toISOString() })
    .eq('email', cleanEmail);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
