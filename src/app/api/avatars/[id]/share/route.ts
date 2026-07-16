import { NextRequest, NextResponse } from 'next/server';
import { authorizeAvatar, getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';
import { listOrgMembers } from '@/lib/org';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ブレインの共有設定(所有者のみ・エンタープライズ限定)。
 * 共有は同じ会社のメンバーに対してのみ。共有相手は閲覧・会話のみ可。
 *
 * GET  → { enabled, shared_with_org, shared_emails, members }
 * POST { shared_with_org, emails } で設定を保存
 */

// 所有者本人 かつ 組織所属(エンタープライズ)であることを要求。
async function requireOrgOwner(avatarId: string) {
  const me = await getAppUser();
  if (!me) return { error: 401 as const };
  const auth = await authorizeAvatar(avatarId, { requireOwner: true });
  if (!auth.ok) return { error: auth.status };
  if (!me.org_id) return { error: 403 as const, notOrg: true };
  return { me, auth };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const r = await requireOrgOwner(params.id);
  if ('error' in r) {
    // 個人アカウント(組織なし)は共有機能自体を持たない。
    return NextResponse.json(
      { enabled: false },
      { status: r.error === 401 ? 401 : 200 },
    );
  }
  const db = supabaseAdmin();
  const { data: avatar } = await db
    .from('avatars')
    .select('shared_with_org')
    .eq('id', params.id)
    .single();
  const { data: shares } = await db
    .from('avatar_shares')
    .select('shared_with_email')
    .eq('avatar_id', params.id);

  // 自社メンバー(自分と会社管理者を除いた候補)。
  const members = (await listOrgMembers(r.me.org_id!))
    .filter((m) => m.email.toLowerCase() !== r.me.email.toLowerCase())
    .map((m) => m.email);

  return NextResponse.json({
    enabled: true,
    shared_with_org:
      (avatar as { shared_with_org?: boolean } | null)?.shared_with_org === true,
    shared_emails: (shares ?? []).map((s) => s.shared_with_email as string),
    members,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const r = await requireOrgOwner(params.id);
  if ('error' in r) {
    return NextResponse.json(
      { error: r.notOrg ? '共有はエンタープライズのみの機能です。' : 'forbidden' },
      { status: r.error },
    );
  }
  const { shared_with_org, emails } = (await req.json().catch(() => ({}))) as {
    shared_with_org?: boolean;
    emails?: string[];
  };
  const db = supabaseAdmin();

  // org 全体共有フラグを更新。
  const { error: upErr } = await db
    .from('avatars')
    .update({ shared_with_org: !!shared_with_org })
    .eq('id', params.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // 個別共有先を、自社メンバーの範囲に限定して置き換える。
  const orgEmails = new Set(
    (await listOrgMembers(r.me.org_id!)).map((m) => m.email.toLowerCase()),
  );
  const clean = Array.from(
    new Set(
      (Array.isArray(emails) ? emails : [])
        .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
        .filter((e) => e && e !== r.me.email.toLowerCase() && orgEmails.has(e)),
    ),
  );

  await db.from('avatar_shares').delete().eq('avatar_id', params.id);
  if (clean.length > 0) {
    const rows = clean.map((email) => ({
      avatar_id: params.id,
      shared_with_email: email,
    }));
    const { error: insErr } = await db.from('avatar_shares').insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
