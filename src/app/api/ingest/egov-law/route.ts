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
 * Sync an entire Japanese law from the e-Gov 法令API into a brain.
 *
 * Fetches the law's full XML from e-Gov, splits it into 条文 (and
 * appendix tables like 別表第二), and upserts each as its own training
 * entry keyed by external_ref "egov:<lawId>:<条名>". Re-running the
 * sync therefore refreshes amended articles in place — point Make at
 * this once a month and the brain tracks 法改正 automatically.
 *
 * The whole law won't fit in one serverless invocation (embedding
 * hundreds of articles takes minutes), so the work is paged: each call
 * processes `limit` entries starting at `offset` and returns
 * next_offset until done. Loop until `done: true`.
 *
 * Body (JSON):
 *   brain_id / brain_name  target brain (one required)
 *   law_id                 e-Gov law id, e.g. 325AC0000000201 (required)
 *   folder                 folder label; defaults to the law's title
 *   offset                 entry index to start at (default 0)
 *   limit                  entries per call (default 40, max 100)
 *   include_appendix       also ingest 別表 (default true)
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
    law_id?: string;
    folder?: string;
    offset?: number;
    limit?: number;
    include_appendix?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const lawId = body.law_id?.trim();
  if (!lawId || !/^[0-9A-Za-z]+$/.test(lawId)) {
    return NextResponse.json(
      { error: 'law_id is required (e.g. 325AC0000000201)' },
      { status: 400 },
    );
  }
  const offset = Math.max(0, Math.floor(body.offset ?? 0));
  const limit = Math.min(100, Math.max(1, Math.floor(body.limit ?? 40)));
  const includeAppendix = body.include_appendix !== false;

  const db = supabaseAdmin();
  let avatarId: string;
  try {
    avatarId = await resolveBrain(db, body);
  } catch (e) {
    if (e instanceof IngestError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  // ---- Fetch the law XML from e-Gov ----
  const egovUrl = `https://elaws.e-gov.go.jp/api/1/lawdata/${lawId}`;
  let xml: string;
  try {
    const res = await fetch(egovUrl, {
      headers: { Accept: 'application/xml' },
    });
    if (!res.ok) {
      throw new Error(`e-Gov API returned HTTP ${res.status}`);
    }
    xml = await res.text();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `e-Gov fetch failed: ${message}` },
      { status: 502 },
    );
  }
  const egovCode = xml.match(/<Code>(\d+)<\/Code>/)?.[1];
  if (egovCode && egovCode !== '0') {
    const egovMessage =
      xml.match(/<Message>([\s\S]*?)<\/Message>/)?.[1] ?? 'unknown e-Gov error';
    return NextResponse.json(
      { error: `e-Gov error (code ${egovCode}): ${egovMessage}` },
      { status: 502 },
    );
  }

  const lawName =
    xml.match(/<LawTitle[^>]*>([\s\S]*?)<\/LawTitle>/)?.[1]?.trim() || lawId;
  const folder = body.folder?.trim() || lawName;

  // ---- Split into per-article entries ----
  const entries = extractEntries(xml, includeAppendix);
  if (entries.length === 0) {
    return NextResponse.json(
      { error: 'no articles found in law XML (unexpected format?)' },
      { status: 422 },
    );
  }

  const page = entries.slice(offset, offset + limit);
  let processed = 0;
  let replacedCount = 0;
  let unchangedCount = 0;
  const errors: Array<{ ref: string; error: string }> = [];
  for (const entry of page) {
    const externalRef = `egov:${lawId}:${entry.key}`;
    try {
      const { replaced, unchanged } = await upsertTextKnowledge({
        db,
        avatarId,
        text: entry.text,
        title: `${lawName} ${entry.title}`,
        folder,
        externalRef,
      });
      processed += 1;
      if (replaced) replacedCount += 1;
      if (unchanged) unchangedCount += 1;
    } catch (e) {
      errors.push({
        ref: externalRef,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const nextOffset = offset + page.length;
  const done = nextOffset >= entries.length;
  if (done) revalidatePath(`/avatars/${avatarId}`);

  return NextResponse.json({
    ok: errors.length === 0,
    law_id: lawId,
    law_name: lawName,
    total_entries: entries.length,
    offset,
    processed,
    replaced: replacedCount,
    unchanged: unchangedCount,
    failed: errors.length,
    errors: errors.slice(0, 5),
    next_offset: done ? null : nextOffset,
    done,
  });
}

type LawEntry = {
  /** Stable key used in external_ref, e.g. 第四十八条 or 別表第二 */
  key: string;
  /** Human label shown in the 学習素材 list, e.g. 第四十八条（用途地域） */
  title: string;
  text: string;
};

/**
 * Pull per-article entries out of e-Gov law XML with plain regex —
 * the Standard Law XML Schema is regular enough that full XML parsing
 * isn't needed for "one entry per 条 / 別表".
 */
function extractEntries(xml: string, includeAppendix: boolean): LawEntry[] {
  const entries: LawEntry[] = [];

  // Main provision only — excludes 附則 (supplementary provisions),
  // which are mostly transition rules and would pollute retrieval.
  const main = xml.match(/<MainProvision[\s\S]*?<\/MainProvision>/)?.[0] ?? '';
  const articleBlocks = main.match(/<Article[\s>][\s\S]*?<\/Article>/g) ?? [];
  const seen = new Set<string>();
  for (const block of articleBlocks) {
    const articleTitle = block
      .match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/)?.[1]
      ?.trim();
    if (!articleTitle) continue;
    // Duplicated Num attributes shouldn't happen, but guard anyway so
    // external_ref stays unique per law.
    if (seen.has(articleTitle)) continue;
    seen.add(articleTitle);
    const caption = block
      .match(/<ArticleCaption[^>]*>([\s\S]*?)<\/ArticleCaption>/)?.[1]
      ?.trim();
    const text = xmlBlockToText(block);
    if (!text) continue;
    entries.push({
      key: articleTitle,
      title: caption ? `${articleTitle}${caption}` : articleTitle,
      text,
    });
  }

  if (includeAppendix) {
    const appdxBlocks = xml.match(/<AppdxTable[\s>][\s\S]*?<\/AppdxTable>/g) ?? [];
    for (const block of appdxBlocks) {
      const title = block
        .match(/<AppdxTableTitle[^>]*>([\s\S]*?)<\/AppdxTableTitle>/)?.[1]
        ?.replace(/<[^>]+>/g, '')
        .trim();
      if (!title) continue;
      // Keys must stay short and stable; the title's leading 別表… part
      // is exactly that (e.g. 別表第二).
      const key = title.split(/[（(\s]/)[0] || title;
      if (seen.has(key)) continue;
      seen.add(key);
      const text = xmlBlockToText(block);
      if (!text) continue;
      entries.push({ key, title, text });
    }
  }

  return entries;
}

/** Strip law XML down to readable plain text, keeping row/段落 breaks. */
function xmlBlockToText(block: string): string {
  return block
    .replace(/<\/(ArticleCaption|ArticleTitle|ParagraphNum|ItemTitle)>/g, '　')
    .replace(/<\/(Paragraph|Item|Subitem1|Subitem2|TableRow|AppdxTableTitle)>/g, '\n')
    .replace(/<\/TableColumn>/g, '　')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t　]+/g, (m) => (m.includes('　') ? '　' : ' '))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
