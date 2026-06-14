import { NextRequest, NextResponse } from 'next/server';
import { getAppUser, supabaseRoute } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Change the caller's own password. Requires the current password to
 * be re-entered and verified (so a hijacked open session can't silently
 * lock the real owner out), then updates it with the admin API.
 * Body: { current_password, new_password }
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { current_password, new_password } = (await req
    .json()
    .catch(() => ({}))) as {
    current_password?: string;
    new_password?: string;
  };
  if (!current_password || !new_password) {
    return NextResponse.json(
      { error: '現在のパスワードと新しいパスワードを入力してください' },
      { status: 400 },
    );
  }
  if (new_password.length < 8) {
    return NextResponse.json(
      { error: '新しいパスワードは8文字以上にしてください' },
      { status: 400 },
    );
  }

  // Verify the current password by attempting a sign-in. This uses a
  // request-scoped client; it refreshes the session cookie as a side
  // effect, which is fine since it's the same user.
  const supa = supabaseRoute();
  const { error: verifyErr } = await supa.auth.signInWithPassword({
    email: me.email,
    password: current_password,
  });
  if (verifyErr) {
    return NextResponse.json(
      { error: '現在のパスワードが違います' },
      { status: 403 },
    );
  }

  // Apply the new password via the admin API (needs the user id).
  const db = supabaseAdmin();
  const { data: list } = await db.auth.admin.listUsers();
  const target = list?.users?.find(
    (u) => u.email?.toLowerCase() === me.email.toLowerCase(),
  );
  if (!target) {
    return NextResponse.json(
      { error: 'アカウントが見つかりません' },
      { status: 404 },
    );
  }
  const { error: updErr } = await db.auth.admin.updateUserById(target.id, {
    password: new_password,
  });
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
