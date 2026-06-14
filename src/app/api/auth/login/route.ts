import { NextRequest, NextResponse } from 'next/server';
import { supabaseRoute } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Email/password login. On success we additionally require the email
 * to be on the app_users allowlist (invite-only) — otherwise we sign
 * the session straight back out and reject. This is the single choke
 * point that enforces "only invited people get in".
 */
export async function POST(req: NextRequest) {
  const { email, password } = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  if (!email || !password) {
    return NextResponse.json(
      { error: 'メールアドレスとパスワードを入力してください' },
      { status: 400 },
    );
  }

  const supa = supabaseRoute();
  const { error } = await supa.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    return NextResponse.json(
      { error: 'メールアドレスまたはパスワードが違います' },
      { status: 401 },
    );
  }

  // Allowlist check — a valid Supabase account is not sufficient.
  const db = supabaseAdmin();
  const { data: allowed } = await db
    .from('app_users')
    .select('email, role')
    .eq('email', email.trim().toLowerCase())
    .single();
  if (!allowed) {
    await supa.auth.signOut();
    return NextResponse.json(
      { error: 'このアカウントは利用を許可されていません。管理者にお問い合わせください。' },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true, role: allowed.role });
}
