import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';
import {
  IngestError,
  resolveBrain,
  upsertTextKnowledge,
} from '@/lib/ingestText';

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

  const db = supabaseAdmin();
  try {
    const avatarId = await resolveBrain(db, body);
    const { videoId, replaced } = await upsertTextKnowledge({
      db,
      avatarId,
      text,
      title: body.title?.trim() || 'テキスト学習(自動)',
      folder: body.folder?.trim() || null,
      externalRef: body.external_ref?.trim() || null,
    });
    revalidatePath(`/avatars/${avatarId}`);
    return NextResponse.json({
      ok: true,
      id: videoId,
      replaced,
      brain_id: avatarId,
    });
  } catch (e) {
    if (e instanceof IngestError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
