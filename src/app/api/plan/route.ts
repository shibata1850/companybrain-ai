import { NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { getPlanUsage } from '@/lib/planEnforce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Caller's own plan + live usage counters. Drives the "ご利用状況"
 * widget on the dashboard. Cheap to call (a couple of count queries).
 */
export async function GET() {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const usage = await getPlanUsage(me);
  return NextResponse.json({
    plan: usage.plan,
    brainsUsed: usage.brainsUsed,
    questionsThisMonth: usage.questionsThisMonth,
  });
}
