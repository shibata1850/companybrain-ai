import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAppUser } from '@/lib/authServer';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';

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
  // 1. Deliver a COPY, not the original. The admin's brain stays
  //    untouched in their account; the requester receives an
  //    independent duplicate (own avatar + copied knowledge chunks),
  //    tagged request_id so it's plan-exempt and material-locked.
  const { data: copyId, error: e1 } = await db.rpc('copy_brain', {
    source_id: avatar.id,
    new_owner: r.requester_email,
    req_id: r.id,
  });
  if (e1 || !copyId) {
    return NextResponse.json(
      { error: e1?.message || 'コピーの作成に失敗しました' },
      { status: 500 },
    );
  }

  // 1b. Duplicate the cover / stage images in Storage so the copy is
  //     fully independent — deleting the admin's original won't blank
  //     out the requester's brain. Best-effort: log failures but keep
  //     the transfer going, since DB state is the source of truth.
  const bucket = storageBucket();
  const { data: srcAvatar } = await db
    .from('avatars')
    .select('cover_image_path, stage_image_path')
    .eq('id', avatar.id)
    .single();
  const newPaths: { cover_image_path?: string; stage_image_path?: string } = {};
  if (srcAvatar?.cover_image_path) {
    const dest = `${copyId}/${randomUUID()}-${srcAvatar.cover_image_path
      .split('/')
      .pop()}`;
    const { error } = await db.storage
      .from(bucket)
      .copy(srcAvatar.cover_image_path, dest);
    if (!error) newPaths.cover_image_path = dest;
  }
  if (srcAvatar?.stage_image_path) {
    const dest = `${copyId}/${randomUUID()}-${srcAvatar.stage_image_path
      .split('/')
      .pop()}`;
    const { error } = await db.storage
      .from(bucket)
      .copy(srcAvatar.stage_image_path, dest);
    if (!error) newPaths.stage_image_path = dest;
  }
  if (Object.keys(newPaths).length > 0) {
    await db.from('avatars').update(newPaths).eq('id', copyId);
  }

  // 2. complete the request, recording which copy was delivered.
  const { error: e2 } = await db
    .from('brain_requests')
    .update({
      status: '完了',
      delivered_avatar_id: copyId,
      completed_at: now,
      updated_at: now,
    })
    .eq('id', params.id);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  // 3. notify the requester (link to their copy)
  await db.from('notifications').insert({
    recipient_email: r.requester_email,
    kind: 'request_completed',
    title: 'ブレイン作成依頼が完了しました',
    body: `「${r.title}」が利用できるようになりました。`,
    link: `/avatars/${copyId}`,
  });

  return NextResponse.json({ ok: true });
}
