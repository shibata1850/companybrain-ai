import { NextRequest, NextResponse } from 'next/server';
import { authorizeAvatar } from '@/lib/authServer';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Folder operations work by bulk-updating every training_videos row
 * that currently carries the `from` folder name. Pass `to` to rename;
 * pass `to: null` (or omit it as null) to delete the folder, which
 * just sends its materials back to 未分類.
 *
 * Body shape:
 *   { from: string, to: string | null }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authorizeAvatar(params.id, { requireOwner: true });
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  // 依頼で作成されたブレインは素材ロック。フォルダの改名・統合も素材の
  // 整理にあたるため、train / dedupe などと同じくここでも拒否する。
  if (auth.fromRequest) {
    return NextResponse.json(
      {
        error: '依頼で作成されたブレインの素材は変更できません。',
        code: 'request_brain_locked',
      },
      { status: 403 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as {
    from?: string;
    to?: string | null;
  };
  const from = body.from?.trim();
  if (!from) {
    return NextResponse.json(
      { error: 'from is required' },
      { status: 400 },
    );
  }
  const to =
    typeof body.to === 'string'
      ? body.to.trim() || null
      : body.to === null
        ? null
        : undefined;
  if (to === undefined) {
    return NextResponse.json(
      { error: 'to is required (string or null)' },
      { status: 400 },
    );
  }
  if (to === from) {
    return NextResponse.json({ ok: true, moved: 0 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('training_videos')
    .update({ folder: to })
    .eq('avatar_id', params.id)
    .eq('folder', from)
    .select('id');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath(`/avatars/${params.id}`);
  revalidatePath(`/avatars/${params.id}/training`);
  return NextResponse.json({ ok: true, moved: data?.length ?? 0 });
}
