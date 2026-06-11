import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import { chunkTranscript, embedTexts } from '@/lib/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * External ingestion endpoint for automation pipelines (Make.com, GAS,
 * cron jobs…). Authenticated with a static bearer token (INGEST_API_KEY)
 * instead of a browser session, and idempotent via external_ref:
 * re-sending the same ref replaces the entry's text and embeddings
 * instead of piling up duplicates — exactly what a "law article sync"
 * needs when a 法令 gets amended.
 *
 * Body (JSON):
 *   brain_id     uuid of the target brain  ─┐ one of the two
 *   brain_name   exact display name        ─┘ is required
 *   text         the knowledge text (required)
 *   title        entry label shown in the 学習素材 list
 *   folder       classification folder (e.g. 建築基準法)
 *   external_ref stable id for upsert (e.g. egov:325AC0000000201:第48条)
 */
export async function POST(req: NextRequest) {
  const configuredKey = env.ingestApiKey();
  if (!configuredKey) {
    return NextResponse.json(
      { error: 'ingestion disabled: INGEST_API_KEY is not set' },
      { status: 503 },
    );
  }
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || token !== configuredKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    brain_id?: string;
    brain_name?: string;
    text?: string;
    title?: string;
    folder?: string;
    external_ref?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }
  const title = body.title?.trim() || 'テキスト学習(自動)';
  const folder = body.folder?.trim() || null;
  const externalRef = body.external_ref?.trim() || null;

  const db = supabaseAdmin();

  // Resolve the target brain by id or by exact name (excluding trashed).
  let avatarId: string | null = null;
  if (body.brain_id) {
    const { data } = await db
      .from('avatars')
      .select('id')
      .eq('id', body.brain_id)
      .is('deleted_at', null)
      .single();
    avatarId = (data?.id as string | undefined) ?? null;
  } else if (body.brain_name?.trim()) {
    const { data } = await db
      .from('avatars')
      .select('id')
      .eq('name', body.brain_name.trim())
      .is('deleted_at', null)
      .limit(2);
    if ((data?.length ?? 0) > 1) {
      return NextResponse.json(
        { error: `brain_name "${body.brain_name}" is ambiguous (multiple matches); use brain_id` },
        { status: 409 },
      );
    }
    avatarId = (data?.[0]?.id as string | undefined) ?? null;
  } else {
    return NextResponse.json(
      { error: 'brain_id or brain_name is required' },
      { status: 400 },
    );
  }
  if (!avatarId) {
    return NextResponse.json({ error: 'brain not found' }, { status: 404 });
  }

  // Upsert: same external_ref replaces the previous entry's content.
  let videoId: string | null = null;
  let replaced = false;
  if (externalRef) {
    const { data: existing } = await db
      .from('training_videos')
      .select('id')
      .eq('avatar_id', avatarId)
      .eq('external_ref', externalRef)
      .limit(1);
    if (existing && existing.length > 0) {
      videoId = existing[0].id as string;
      replaced = true;
      await db
        .from('training_videos')
        .update({ status: 'processing', file_name: title, folder })
        .eq('id', videoId);
      // Old chunks are about to be superseded; drop them first so the
      // brain never sees both versions of an amended article.
      await db.from('knowledge_chunks').delete().eq('video_id', videoId);
    }
  }
  if (!videoId) {
    const { data: tv, error: tvErr } = await db
      .from('training_videos')
      .insert({
        avatar_id: avatarId,
        storage_path: null,
        file_name: title,
        mime_type: 'text/plain',
        source_type: 'text',
        folder,
        external_ref: externalRef,
        status: 'processing',
      })
      .select('id')
      .single();
    if (tvErr || !tv) {
      return NextResponse.json(
        { error: tvErr?.message || 'insert failed' },
        { status: 500 },
      );
    }
    videoId = tv.id as string;
  }

  try {
    const chunks = chunkTranscript(text);
    const embeddings = chunks.length > 0 ? await embedTexts(chunks) : [];
    if (chunks.length > 0) {
      const rows = chunks.map((content, i) => ({
        avatar_id: avatarId,
        video_id: videoId,
        content,
        embedding: embeddings[i],
      }));
      const { error } = await db.from('knowledge_chunks').insert(rows);
      if (error) throw error;
    }
    await db
      .from('training_videos')
      .update({
        status: 'ready',
        transcript: text,
        summary: text.length > 120 ? text.slice(0, 120) + '…' : text,
      })
      .eq('id', videoId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from('training_videos')
      .update({ status: 'error', error_message: message })
      .eq('id', videoId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  revalidatePath(`/avatars/${avatarId}`);
  return NextResponse.json({
    ok: true,
    id: videoId,
    replaced,
    brain_id: avatarId,
  });
}
