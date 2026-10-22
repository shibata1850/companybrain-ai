import { NextRequest, NextResponse } from 'next/server';
import { authorizeAvatar } from '@/lib/authServer';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const routeParams = await params;
  const auth = await authorizeAvatar(routeParams.id, { requireOwner: true });
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  const db = supabaseAdmin();
  const { error } = await db
    .from('avatars')
    .update({ deleted_at: null })
    .eq('id', routeParams.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath('/');
  revalidatePath('/trash');
  return NextResponse.json({ ok: true });
}
