import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Avoid ambiguous characters (0/O/o, 1/l/I) so the admin can dictate the
// temporary password over the phone without confusion.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generateTempPassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Admin issues a one-shot temporary password for a user who forgot
 * theirs. The new password is returned once in the response so the
 * admin can copy it and pass it to the user out-of-band — it is NOT
 * stored anywhere readable afterwards.
 * Body: { email }
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Must be on the allowlist — refuse to mint passwords for anyone else.
  const { data: allowed } = await db
    .from('app_users')
    .select('email')
    .eq('email', cleanEmail)
    .single();
  if (!allowed) {
    return NextResponse.json(
      { error: 'このユーザーは登録されていません' },
      { status: 404 },
    );
  }

  const { data: list } = await db.auth.admin.listUsers();
  const target = list?.users?.find(
    (u) => u.email?.toLowerCase() === cleanEmail,
  );
  if (!target) {
    return NextResponse.json(
      { error: 'Supabase Auth にアカウントが見つかりません' },
      { status: 404 },
    );
  }

  const password = generateTempPassword(12);
  const { error: updErr } = await db.auth.admin.updateUserById(target.id, {
    password,
  });
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, password });
}
