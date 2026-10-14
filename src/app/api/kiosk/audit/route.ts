import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { clientIp, kioskConfig, kioskKeyMatches } from '@/lib/kioskAuth';
import { enforceRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * キオスク会話の監査記録。actor はサーバー側で固定の「kiosk」。
 * 公開の場の会話なので、現地に「会話は記録されます」の掲示を併用する。
 */
export async function POST(req: NextRequest) {
  const cfg = kioskConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'kiosk is not configured' },
      { status: 503 },
    );
  }
  const limited = enforceRateLimit(`kiosk-audit:${clientIp(req)}`, 60, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    key?: string;
    entries?: Array<{
      role?: string;
      content?: string;
      session_id?: string | null;
    }>;
  } | null;
  if (!body || !kioskKeyMatches(body.key, cfg.key)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const db = supabaseAdmin();
  const { data: avatar } = await db
    .from('avatars')
    .select('name')
    .eq('id', cfg.avatarId)
    .single();

  const rows = (body.entries ?? [])
    .slice(0, 20)
    .filter((e) => e && typeof e.content === 'string' && e.content.trim())
    .map((e) => ({
      avatar_id: cfg.avatarId,
      avatar_name: (avatar?.name as string | undefined) ?? null,
      session_id:
        typeof e.session_id === 'string' ? e.session_id.slice(0, 64) : null,
      actor: 'kiosk',
      role: e.role === 'agent' ? 'agent' : 'user',
      content: (e.content as string).slice(0, 8000),
      sources: null,
      escalation: null,
    }));
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }
  const { error } = await db.from('audit_logs').insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, inserted: rows.length });
}
