import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getTalkStatus } from '@/lib/did';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const db = supabaseAdmin();
  const { data: gen, error } = await db
    .from('generations')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error || !gen) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // If we already have a final URL or it has errored out, just return it.
  if (gen.status === 'ready' || gen.status === 'error') {
    return NextResponse.json({ generation: gen });
  }

  // Otherwise, ask D-ID what's going on. heygen_video_id now holds the
  // D-ID talk id.
  if (gen.heygen_video_id) {
    try {
      const status = await getTalkStatus(gen.heygen_video_id);
      if (status.status === 'done' && status.videoUrl) {
        const { data: updated } = await db
          .from('generations')
          .update({
            status: 'ready',
            video_url: status.videoUrl,
            thumbnail_url: status.thumbnailUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', gen.id)
          .select('*')
          .single();
        return NextResponse.json({ generation: updated ?? gen });
      }
      if (status.status === 'error' || status.status === 'rejected') {
        const { data: updated } = await db
          .from('generations')
          .update({
            status: 'error',
            error_message: status.error || 'video render failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', gen.id)
          .select('*')
          .single();
        return NextResponse.json({ generation: updated ?? gen });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ generation: gen, poll_error: message });
    }
  }

  return NextResponse.json({ generation: gen });
}

/**
 * Edit the answer text of a draft generation. Only allowed before the
 * draft is sent to HeyGen.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = (await req.json().catch(() => ({}))) as { answer?: string };
  if (typeof body.answer !== 'string') {
    return NextResponse.json(
      { error: 'answer (string) is required' },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const { data: gen } = await db
    .from('generations')
    .select('id, avatar_id, status')
    .eq('id', params.id)
    .single();
  if (!gen) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (gen.status === 'rendering' || gen.status === 'ready') {
    return NextResponse.json(
      { error: 'cannot edit a generation that is already rendering or ready' },
      { status: 400 },
    );
  }

  const { error } = await db
    .from('generations')
    .update({
      answer: body.answer,
      status: 'draft',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath(`/avatars/${gen.avatar_id}`);
  return NextResponse.json({ ok: true });
}

/**
 * Discard a generation (typically a draft the user decided not to render).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const db = supabaseAdmin();
  const { data: gen } = await db
    .from('generations')
    .select('id, avatar_id')
    .eq('id', params.id)
    .single();
  if (!gen) {
    return NextResponse.json({ ok: true });
  }
  const { error } = await db
    .from('generations')
    .delete()
    .eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath(`/avatars/${gen.avatar_id}`);
  return NextResponse.json({ ok: true });
}
