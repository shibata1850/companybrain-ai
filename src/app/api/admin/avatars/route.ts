import { NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only roster of every brain across all users, with owner,
 * material count, and last-activity, for the management page. Kept
 * lightweight (no signed cover URLs) so it stays fast with many brains.
 */
export async function GET() {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const db = supabaseAdmin();

  const { data: avatars, error } = await db
    .from('avatars')
    .select('id, name, description, owner_email, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Material counts per brain (one grouped query, then map).
  const counts = new Map<string, number>();
  for (const a of avatars ?? []) {
    const { count } = await db
      .from('training_videos')
      .select('id', { count: 'exact', head: true })
      .eq('avatar_id', a.id);
    counts.set(a.id as string, count ?? 0);
  }

  // Last audit activity per brain.
  const lastActivity = new Map<string, string>();
  const { data: recent } = await db
    .from('audit_logs')
    .select('avatar_id, created_at')
    .order('created_at', { ascending: false })
    .limit(2000);
  for (const r of recent ?? []) {
    const id = r.avatar_id as string | null;
    if (id && !lastActivity.has(id)) {
      lastActivity.set(id, r.created_at as string);
    }
  }

  // Admin's labels for the owners (never their private display_name).
  const { data: labels } = await db
    .from('app_users')
    .select('email, admin_label');
  const labelByEmail = new Map(
    (labels ?? []).map((l) => [l.email as string, l.admin_label as string | null]),
  );

  const rows = (avatars ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    owner_email: a.owner_email,
    owner_label: labelByEmail.get(a.owner_email as string) ?? null,
    created_at: a.created_at,
    material_count: counts.get(a.id as string) ?? 0,
    last_activity: lastActivity.get(a.id as string) ?? null,
  }));

  return NextResponse.json({ avatars: rows });
}
