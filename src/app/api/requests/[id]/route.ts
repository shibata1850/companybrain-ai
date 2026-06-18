import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fetchRequest(id: string) {
  const db = supabaseAdmin();
  const { data } = await db
    .from('brain_requests')
    .select(
      'id, requester_email, title, purpose, persona, materials, notes, status, assignee_email, result_avatar_id, reject_reason, created_at, updated_at, completed_at',
    )
    .eq('id', id)
    .single();
  return data;
}

/**
 * GET one request. The requester or any admin may read it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const r = await fetchRequest(params.id);
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (
    me.role !== 'admin' &&
    r.requester_email?.toLowerCase() !== me.email.toLowerCase()
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ request: r });
}

/**
 * PATCH updates the request. Admin-only fields: status, assignee_email,
 * result_avatar_id, reject_reason. The requester can edit their own
 * description (title/purpose/persona/materials/notes) only while the
 * request is still 申請中.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const current = await fetchRequest(params.id);
  if (!current) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const isOwner =
    current.requester_email?.toLowerCase() === me.email.toLowerCase();
  if (me.role !== 'admin' && !isOwner) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Description fields (editable by the requester while still 申請中,
  // or by an admin at any time).
  const descKeys = ['title', 'purpose', 'persona', 'materials', 'notes'] as const;
  const canEditDesc = me.role === 'admin' || (isOwner && current.status === '申請中');
  if (canEditDesc) {
    for (const k of descKeys) {
      if (typeof body[k] === 'string') {
        updates[k] = (body[k] as string).trim() || null;
      }
    }
  }

  // Admin-only workflow fields.
  if (me.role === 'admin') {
    if (typeof body.status === 'string') {
      const ok = ['申請中', '対応中', '完了', '却下'].includes(body.status);
      if (!ok) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 });
      }
      updates.status = body.status;
      if (body.status === '完了') updates.completed_at = new Date().toISOString();
    }
    if (body.assignee_email === null || typeof body.assignee_email === 'string') {
      updates.assignee_email = body.assignee_email
        ? (body.assignee_email as string).trim() || null
        : null;
    }
    if (body.result_avatar_id === null || typeof body.result_avatar_id === 'string') {
      updates.result_avatar_id = body.result_avatar_id || null;
    }
    if (body.reject_reason === null || typeof body.reject_reason === 'string') {
      updates.reject_reason = body.reject_reason
        ? (body.reject_reason as string).trim() || null
        : null;
    }
  }

  // Requester can cancel their own 申請中 request.
  if (
    isOwner &&
    me.role !== 'admin' &&
    body.status === '却下' &&
    current.status === '申請中'
  ) {
    updates.status = '却下';
    updates.reject_reason =
      typeof body.reject_reason === 'string'
        ? body.reject_reason.trim() || '申請者がキャンセル'
        : '申請者がキャンセル';
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from('brain_requests')
    .update(updates)
    .eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reject-side notification (admin rejected; not when the requester
  // cancels their own).
  if (
    me.role === 'admin' &&
    body.status === '却下' &&
    current.status !== '却下'
  ) {
    await db.from('notifications').insert({
      recipient_email: current.requester_email,
      kind: 'request_rejected',
      title: 'ブレイン作成依頼が却下されました',
      body: `「${current.title}」: ${
        (updates.reject_reason as string | null) ?? '（理由未記入）'
      }`,
      link: `/requests/${params.id}`,
    });
  }

  return NextResponse.json({ ok: true });
}
