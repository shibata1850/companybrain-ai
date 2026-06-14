import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') return null;
  return me;
}

/** List all allowlisted users. Admin only. */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('app_users')
    .select('email, role, created_at')
    .order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ users: data ?? [] });
}

/**
 * Invite a user: create their Supabase Auth account with an initial
 * password and add them to the allowlist. Admin only.
 * Body: { email, password, role? }
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { email, password, role } = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    role?: string;
  };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail || !password || password.length < 8) {
    return NextResponse.json(
      { error: 'メールアドレスと8文字以上のパスワードが必要です' },
      { status: 400 },
    );
  }
  const cleanRole = role === 'admin' ? 'admin' : 'member';

  const db = supabaseAdmin();

  // Create the auth account (auto-confirmed so no email step needed).
  const { error: createErr } = await db.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
  });
  // Ignore "already registered" so we can re-add an allowlist entry for
  // an existing auth account; surface anything else.
  if (createErr && !/already|exists|registered/i.test(createErr.message)) {
    return NextResponse.json({ error: createErr.message }, { status: 500 });
  }

  const { error: upsertErr } = await db
    .from('app_users')
    .upsert({ email: cleanEmail, role: cleanRole }, { onConflict: 'email' });
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Revoke access: remove from the allowlist (and delete the auth
 * account so they can't sign in again). Admin only.
 * Body: { email }
 */
export async function DELETE(req: NextRequest) {
  const me = await requireAdmin();
  if (!me) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }
  if (cleanEmail === me.email.toLowerCase()) {
    return NextResponse.json(
      { error: '自分自身は削除できません' },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  await db.from('app_users').delete().eq('email', cleanEmail);
  // Best-effort auth account removal.
  try {
    const { data: list } = await db.auth.admin.listUsers();
    const target = list?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail,
    );
    if (target) await db.auth.admin.deleteUser(target.id);
  } catch {
    // allowlist removal already blocks login; auth cleanup is bonus
  }
  return NextResponse.json({ ok: true });
}
