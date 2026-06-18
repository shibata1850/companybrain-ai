import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only: hand the linked brain over to the requester. Sets the
 * avatar's owner_email, marks the request 完了, and notifies the user.
 * The avatar must be attached to the request first (via PATCH
 * result_avatar_id), and the caller must currently own it.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const db = supabaseAdmin();
  const { data: r } = await db
    .from('brain_requests')
    .select('id, requester_email, title, status, result_avatar_id')
    .eq('id', params.id)
    .single();
  if (!r) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (!r.result_avatar_id) {
    return NextResponse.json(
      { error: '完成したブレインがリンクされていません。先にブレインを紐付けてください。' },
      { status: 400 },
    );
  }

  const { data: avatar } = await db
    .from('avatars')
    .select('id, owner_email, name')
    .eq('id', r.result_avatar_id)
    .single();
  if (!avatar) {
    return NextResponse.json(
      { error: 'リンクされたブレインが見つかりません' },
      { status: 404 },
    );
  }
  if ((avatar.owner_email ?? '').toLowerCase() !== me.email.toLowerCase()) {
    return NextResponse.json(
      { error: '自分が所有するブレインのみ譲渡できます' },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();
  // 1. transfer ownership + tag as a request-built brain (this exempts
  //    it from the requester's plan limits and locks material additions)
  const { error: e1 } = await db
    .from('avatars')
    .update({ owner_email: r.requester_email, request_id: r.id })
    .eq('id', avatar.id);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  // 2. complete the request
  const { error: e2 } = await db
    .from('brain_requests')
    .update({ status: '完了', completed_at: now, updated_at: now })
    .eq('id', params.id);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  // 3. notify the requester
  await db.from('notifications').insert({
    recipient_email: r.requester_email,
    kind: 'request_completed',
    title: 'ブレイン作成依頼が完了しました',
    body: `「${r.title}」が利用できるようになりました。`,
    link: `/avatars/${avatar.id}`,
  });

  return NextResponse.json({ ok: true });
}
