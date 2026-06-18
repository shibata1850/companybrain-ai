import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Update the caller's OWN display name. This only ever touches the
 * current user's row — a user can never change anyone else's name, and
 * the admin's separate label for this user is left untouched.
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { display_name } = (await req.json().catch(() => ({}))) as {
    display_name?: string | null;
  };
  const value =
    typeof display_name === 'string' ? display_name.trim().slice(0, 60) || null : null;

  const db = supabaseAdmin();
  const { error } = await db
    .from('app_users')
    .update({ display_name: value })
    .eq('email', me.email);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, display_name: value });
}
