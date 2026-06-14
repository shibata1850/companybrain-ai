import { NextResponse } from 'next/server';
import { supabaseRoute } from '@/lib/authServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const supa = supabaseRoute();
  await supa.auth.signOut();
  return NextResponse.json({ ok: true });
}
