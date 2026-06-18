import { NextRequest, NextResponse } from 'next/server';
import { supabaseRoute } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Self-service signup. Anyone can create a free account: we create the
 * Supabase Auth user (auto-confirmed, since no SMTP is configured),
 * add them to the app_users allowlist on the free plan, then sign them
 * in so the session cookie is set. Upgrades to paid plans are arranged
 * separately by emailing the admin (invoice / bank transfer).
 *
 * Body: { email, password, company? }
 */
export async function POST(req: NextRequest) {
  const { email, password, company } = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    company?: string;
  };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail || !/.+@.+\..+/.test(cleanEmail)) {
    return NextResponse.json(
      { error: '有効なメールアドレスを入力してください' },
      { status: 400 },
    );
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: 'パスワードは8文字以上にしてください' },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  // Already on the allowlist → they have an account; send them to login.
  const { data: existing } = await db
    .from('app_users')
    .select('email')
    .eq('email', cleanEmail)
    .single();
  if (existing) {
    return NextResponse.json(
      { error: 'このメールアドレスは既に登録されています。ログインしてください。' },
      { status: 409 },
    );
  }

  // Create the auth account (auto-confirmed: no email verification step).
  const { error: createErr } = await db.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
  });
  if (createErr && !/already|exists|registered/i.test(createErr.message)) {
    return NextResponse.json({ error: createErr.message }, { status: 500 });
  }

  // Add to the allowlist on the free plan.
  const { error: insErr } = await db.from('app_users').upsert(
    {
      email: cleanEmail,
      role: 'member',
      plan: 'free',
      company: company?.trim()?.slice(0, 120) || null,
    },
    { onConflict: 'email' },
  );
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Sign them in so the session cookie is set for the redirect.
  const supa = supabaseRoute();
  const { error: signErr } = await supa.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (signErr) {
    // Account exists but sign-in failed (e.g. the email was already
    // registered with a different password). Fall back to manual login.
    return NextResponse.json({ ok: true, signedIn: false });
  }

  return NextResponse.json({ ok: true, signedIn: true });
}
