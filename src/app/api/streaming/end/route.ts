import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The streaming page POSTs here when a voice session ends, with the
 * elapsed seconds the user actually held the conversation open. We
 * append a voice_sessions row so plan-enforce can sum monthly usage.
 *
 * Body: { avatarId?: string, seconds: number }
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { avatarId, seconds } = (await req.json().catch(() => ({}))) as {
    avatarId?: string;
    seconds?: number;
  };
  // Cap a single session at 8h to bound the trust we place in client
  // self-reported numbers. (Long-term: replace with token-side session
  // open + server-confirmed elapsed at close.)
  const raw = Math.max(0, Math.round(Number(seconds) || 0));
  const s = Math.min(raw, 8 * 60 * 60);
  if (s === 0) return NextResponse.json({ ok: true, recorded: 0 });

  const db = supabaseAdmin();
  const { error } = await db.from('voice_sessions').insert({
    actor: me.email,
    avatar_id: avatarId || null,
    seconds: s,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recorded: s });
}
