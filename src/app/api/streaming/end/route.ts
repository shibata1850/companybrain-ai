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
  const { avatarId, seconds, sessionId } = (await req
    .json()
    .catch(() => ({}))) as {
    avatarId?: string;
    seconds?: number;
    sessionId?: string;
  };
  const raw = Math.max(0, Math.round(Number(seconds) || 0));
  const db = supabaseAdmin();

  // 0032: トークン発行時にサーバーが作った行を閉じる。申告秒数は
  // 「サーバー実測の経過+猶予60秒」でクランプし、水増しを防ぐ。
  if (sessionId) {
    const { data: row } = await db
      .from('voice_sessions')
      .select('id, started_at, ended_at')
      .eq('id', sessionId)
      .eq('actor', me.email)
      .single();
    if (row) {
      if (row.ended_at) {
        // 二重報告(keepalive の再送等)は無視する。
        return NextResponse.json({ ok: true, recorded: 0 });
      }
      const startedAt = row.started_at
        ? new Date(row.started_at as string).getTime()
        : null;
      const elapsed =
        startedAt !== null
          ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) + 60
          : raw;
      const s = Math.min(raw, elapsed, 8 * 60 * 60);
      const { error } = await db
        .from('voice_sessions')
        .update({ seconds: s, ended_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('actor', me.email);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, recorded: s });
    }
    // 行が見つからなければ旧方式(下)へフォールバック。
  }

  // 旧方式: セッションIDなしの自己申告。8時間でクランプ。
  const s = Math.min(raw, 8 * 60 * 60);
  if (s === 0) return NextResponse.json({ ok: true, recorded: 0 });
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
