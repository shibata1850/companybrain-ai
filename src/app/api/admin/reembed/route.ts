import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';
import { embedTexts } from '@/lib/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * 埋め込みの後追い生成(管理者専用)。
 *
 * knowledge_chunks は通常、学習時に埋め込み(意味検索用ベクトル)まで
 * 作られるが、外部からの直接投入や過去の移行で embedding が NULL の
 * チャンクが残ることがある。NULL のままでもキーワード検索は効くが、
 * 言い換え・文脈での一致(意味検索)には乗らない。
 *
 * この API は NULL のチャンクをまとめて埋め込み、意味検索に乗せる。
 * 画面(/admin/maintenance)から残数が 0 になるまで繰り返し呼ぶ。
 */

async function requireAdmin() {
  const me = await getAppUser();
  if (!me || me.role !== 'admin') return null;
  return me;
}

/** 残数の確認。 */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const db = supabaseAdmin();
  const { count, error } = await db
    .from('knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ remaining: count ?? 0 });
}

/** 未埋め込みチャンクをまとめて埋め込む(1回あたり最大150件)。 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.min(Math.max(1, Math.floor(body.limit ?? 100)), 150);

  const db = supabaseAdmin();
  const { data: rows, error } = await db
    .from('knowledge_chunks')
    .select('id, content')
    .is('embedding', null)
    .order('id')
    .limit(limit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0 });
  }

  const embeddings = await embedTexts(rows.map((r) => String(r.content)));

  // 1件ずつの UPDATE を数本ずつ並行で流す(150件でも数秒で終わる)。
  const CONCURRENCY = 10;
  let failed = 0;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((r, j) =>
        db
          .from('knowledge_chunks')
          .update({ embedding: embeddings[i + j] })
          .eq('id', r.id),
      ),
    );
    for (const res of results) {
      if (res.error) failed += 1;
    }
  }

  const { count } = await db
    .from('knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);

  return NextResponse.json({
    processed: rows.length - failed,
    failed,
    remaining: count ?? 0,
  });
}
