import { NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Count of requests needing the viewer's attention, for the bottom-nav
 * badge. Admins: new (申請中) requests awaiting acceptance. Members
 * don't get a request badge (their updates arrive via お知らせ).
 */
export async function GET() {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
  if (me.role !== 'admin') {
    return NextResponse.json({ count: 0 });
  }
  const db = supabaseAdmin();
  const { count } = await db
    .from('brain_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', '申請中');
  return NextResponse.json({ count: count ?? 0 });
}
