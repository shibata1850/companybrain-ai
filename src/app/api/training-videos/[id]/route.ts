import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';
import { chunkTranscript, embedTexts, understandMaterial } from '@/lib/gemini';
import { saveExtractedRules } from '@/lib/materialRules';
import { authorizeAvatar } from '@/lib/authServer';
import { reportError } from '@/lib/errorReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Body = {
  file_name?: string | null;
  transcript?: string | null;
  folder?: string | null;
};

/**
 * Update one piece of training material. Editing the transcript invalidates
 * the old knowledge_chunks for this row and re-chunks + re-embeds the new
 * text. Editing only file_name is a cheap rename.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const routeParams = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const db = supabaseAdmin();

  const { data: existing, error: getErr } = await db
    .from('training_videos')
    .select('id, avatar_id, transcript')
    .eq('id', routeParams.id)
    .single();
  if (getErr || !existing) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  // Only the owner of the parent brain may edit its material.
  const auth = await authorizeAvatar(existing.avatar_id as string, { requireOwner: true });
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.file_name === 'string') {
    updates.file_name = body.file_name.trim() || null;
  }
  if (body.folder !== undefined) {
    updates.folder =
      typeof body.folder === 'string' ? body.folder.trim() || null : null;
  }
  const transcriptChanged =
    typeof body.transcript === 'string' &&
    body.transcript !== existing.transcript;
  // 依頼ブレインは素材ロック(追加系ルートと同じ扱い)。本文の編集は
  // 実質「任意テキストの再学習」なのでここでも塞ぐ。名前変更・
  // フォルダ整理は学習内容を変えないため許可する。
  if (transcriptChanged && auth.fromRequest) {
    return NextResponse.json(
      {
        error: '依頼で作成されたブレインの素材は編集できません。',
        code: 'request_brain_locked',
      },
      { status: 403 },
    );
  }
  if (transcriptChanged) {
    const next = body.transcript || '';
    updates.transcript = next;
    updates.summary = next.length > 120 ? next.slice(0, 120) + '…' : next;
    updates.status = 'processing';
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error: updErr } = await db
    .from('training_videos')
    .update(updates)
    .eq('id', routeParams.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  if (transcriptChanged) {
    try {
      await db.from('knowledge_chunks').delete().eq('video_id', routeParams.id);
      const newText = (updates.transcript as string) || '';
      const chunks = chunkTranscript(newText);
      if (chunks.length > 0) {
        const embeddings = await embedTexts(chunks);
        const rows = chunks.map((content, i) => ({
          avatar_id: existing.avatar_id,
          video_id: routeParams.id,
          content,
          embedding: embeddings[i],
        }));
        const { error } = await db.from('knowledge_chunks').insert(rows);
        if (error) throw error;
      }
      // 本文が変わったので「理解」もやり直す。旧本文から抽出した
      // ルールが残り続けると、削除したはずの指示が毎セッション注入
      // され続けてしまう。理解に失敗した場合はルールを空にして
      // 失効させる(残存よりも消える方が安全)。
      try {
        const understood = await understandMaterial(newText);
        if (understood.summary) {
          await db
            .from('training_videos')
            .update({ summary: understood.summary })
            .eq('id', routeParams.id);
        }
        await saveExtractedRules(routeParams.id, understood.rules);
      } catch (understandErr) {
        console.warn(
          '[training-videos PATCH] understandMaterial failed — 旧ルールを失効:',
          understandErr instanceof Error
            ? understandErr.message
            : String(understandErr),
        );
        await saveExtractedRules(routeParams.id, []);
      }
      await db
        .from('training_videos')
        .update({ status: 'ready' })
        .eq('id', routeParams.id);
    } catch (e) {
      reportError(e, {
        route: 'PATCH /api/training-videos/[id]',
        actor: auth.me.email,
      });
      const message = e instanceof Error ? e.message : String(e);
      await db
        .from('training_videos')
        .update({ status: 'error', error_message: message })
        .eq('id', routeParams.id);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  revalidatePath(`/avatars/${existing.avatar_id}`);
  return NextResponse.json({ ok: true });
}

/**
 * Permanently delete one training material entry along with its storage
 * file (if any) and its knowledge_chunks (cascade).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const routeParams = await params;
  const db = supabaseAdmin();
  const { data: existing, error: getErr } = await db
    .from('training_videos')
    .select('id, avatar_id, storage_path')
    .eq('id', routeParams.id)
    .single();
  if (getErr || !existing) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const auth = await authorizeAvatar(existing.avatar_id as string, { requireOwner: true });
  if (!auth.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: auth.status });
  }
  // 依頼ブレインは素材ロック: 学習素材の削除も不可(追加系と同じ扱い)。
  if (auth.fromRequest) {
    return NextResponse.json(
      {
        error: '依頼で作成されたブレインの素材は削除できません。',
        code: 'request_brain_locked',
      },
      { status: 403 },
    );
  }

  if (existing.storage_path) {
    await db.storage.from(storageBucket()).remove([existing.storage_path]);
  }

  const { error } = await db
    .from('training_videos')
    .delete()
    .eq('id', routeParams.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath(`/avatars/${existing.avatar_id}`);
  return NextResponse.json({ ok: true });
}
