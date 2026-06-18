import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET lists brain creation requests.
 *   admin: every request, optional ?status=申請中|対応中|完了|却下
 *   member: their own requests only
 */
export async function GET(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || '';

  const db = supabaseAdmin();
  let query = db
    .from('brain_requests')
    .select(
      'id, requester_email, title, purpose, persona, materials, notes, status, assignee_email, result_avatar_id, reject_reason, created_at, updated_at, completed_at',
    )
    .order('created_at', { ascending: false })
    .limit(500);
  if (me.role !== 'admin') {
    query = query.eq('requester_email', me.email);
  }
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Decorate with the admin's label per requester for friendlier display.
  if (me.role === 'admin') {
    const { data: labels } = await db
      .from('app_users')
      .select('email, admin_label');
    const labelMap = new Map(
      (labels ?? []).map((l) => [l.email as string, l.admin_label as string | null]),
    );
    const decorated = (data ?? []).map((r) => ({
      ...r,
      requester_label: labelMap.get(r.requester_email as string) ?? null,
    }));
    return NextResponse.json({ requests: decorated });
  }
  return NextResponse.json({ requests: data ?? [] });
}

/**
 * POST creates a new request. Anyone signed in may file one.
 * Body: { title, purpose, persona?, materials?, notes? }
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    purpose?: string;
    persona?: string;
    materials?: string;
    notes?: string;
  };
  const title = body.title?.trim();
  const purpose = body.purpose?.trim();
  if (!title || !purpose) {
    return NextResponse.json(
      { error: 'ブレイン名と用途は必須です' },
      { status: 400 },
    );
  }
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('brain_requests')
    .insert({
      requester_email: me.email,
      title: title.slice(0, 80),
      purpose: purpose.slice(0, 2000),
      persona: body.persona?.trim().slice(0, 2000) || null,
      materials: body.materials?.trim().slice(0, 20000) || null,
      notes: body.notes?.trim().slice(0, 2000) || null,
    })
    .select('id')
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'insert failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id: data.id });
}
