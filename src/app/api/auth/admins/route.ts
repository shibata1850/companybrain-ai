import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public — used by the "メアド・パスワードを忘れた方" page so the user
 * knows who to contact for a reissue. Returns only the email; nothing
 * sensitive.
 */
export async function GET() {
  const db = supabaseAdmin();
  const { data } = await db
    .from('app_users')
    .select('email')
    .eq('role', 'admin')
    .order('email');
  return NextResponse.json({ admins: (data ?? []).map((r) => r.email) });
}
