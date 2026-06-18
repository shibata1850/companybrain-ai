import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Toggle a user's suspension. Suspended users keep their account,
 * brains and history, but the auth layer rejects them on login and on
 * every authenticated request until reactivated.
 * Body: { email, suspend: true | false }
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { email, suspend } = (await req.json().catch(() => ({}))) as {
    email?: string;
    suspend?: boolean;
  };
  const cleanEmail = email?.trim().toLowerCase();
  if (!cleanEmail) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }
  if (cleanEmail === me.email.toLowerCase()) {
    return NextResponse.json(
      { error: '自分自身は一時停止できません' },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from('app_users')
    .update({ suspended_at: suspend ? new Date().toISOString() : null })
    .eq('email', cleanEmail);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
