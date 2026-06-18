import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Persist the user's drag-and-drop ordering of their own brains. We
 * write descending sort_order values so freshly reordered brains stay
 * on top with the existing "order by sort_order desc, created_at desc"
 * query. The client sends the visible order top-to-bottom.
 * Body: { ids: string[] }
 */
export async function POST(req: NextRequest) {
  const me = await getAppUser();
  if (!me) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const db = supabaseAdmin();
  // Only act on rows the caller actually owns; ignore foreign ids.
  const { data: owned } = await db
    .from('avatars')
    .select('id')
    .eq('owner_email', me.email)
    .in('id', ids);
  const allowed = new Set((owned ?? []).map((r) => r.id as string));

  // Top of the list = highest sort_order. Use a high base so future
  // single-insert reorderings still have room without rewriting all.
  const base = 1_000_000;
  const updates = ids
    .filter((id) => allowed.has(id))
    .map((id, i) => ({ id, sort_order: base - i }));

  // Supabase requires upsert for bulk; ids are PKs so onConflict='id'.
  // owner_email is preserved (we don't pass it in the update set).
  let updated = 0;
  for (const u of updates) {
    const { error } = await db
      .from('avatars')
      .update({ sort_order: u.sort_order })
      .eq('id', u.id);
    if (!error) updated++;
  }
  return NextResponse.json({ ok: true, updated });
}
