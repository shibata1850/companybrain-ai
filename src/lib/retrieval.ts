import { supabaseAdmin } from './supabase';
import { embedTexts } from './gemini';

/**
 * ハイブリッド検索(意味検索 + キーワード検索)。
 *
 * 意味検索(pgvector)だけでは、定型文の多い社内規程で取りこぼしが出る。
 * 実測では、社内マニュアル(184チャンク)のうち 95% が「本条の運用責任は…」
 * のような定型文を含み、固有語(例: パスワード)を含むチャンクでも本文の
 * 6〜7割が定型文だった。結果、ベクトルが「一般的な規程の言い回し」に
 * 引き寄せられ、答えを含むチャンクが上位6件に入らず「資料に記載がない」と
 * 回答してしまう事象が発生した。
 *
 * そこで、質問から固有語を抜き出した完全一致検索を併用し、両者の結果を
 * 統合する。キーワードが一致したチャンクは精度が高いので優先する。
 */

/** 検索から除外する、単独では意味を持たない語。 */
const STOPWORDS = new Set([
  '何文字', '以上', '以下', '未満', '場合', '必要', '教えて', '確認',
  '方法', '手順', '基準', '規定', '規程', '上限', '下限', '周期',
  'について', 'どこ', 'いくら', 'いつ', 'なに', 'どの',
]);

/**
 * 日本語の質問から検索キーワードを抽出する。日本語は分かち書きされない
 * ため、カタカナ・漢字・英数字の連続を語の候補とみなす。
 * 長い漢字列(例: 校正周期)は文書中に無いことがあるので、2文字単位に
 * 分割した候補も加えて取りこぼしを防ぐ。
 */
export function extractKeywords(query: string, max = 4): string[] {
  const runs = query.match(/[ァ-ヴー]{2,}|[一-龠々]{2,}|[A-Za-z0-9]{2,}/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (w: string) => {
    if (w.length < 2 || STOPWORDS.has(w) || seen.has(w)) return;
    seen.add(w);
    out.push(w);
  };
  for (const r of runs) add(r);
  // 4文字以上の漢字列は、前半・後半の2文字にも分けて候補にする
  // (「校正周期」→「校正」「周期」。文書側の表記ゆれを拾うため)
  for (const r of runs) {
    if (/^[一-龠々]{4,}$/.test(r)) {
      add(r.slice(0, 2));
      add(r.slice(2, 4));
    }
  }
  // 長い語(=固有性が高い)を優先する
  return out.sort((a, b) => b.length - a.length).slice(0, max);
}

export type KnowledgeHit = { content: string; source: 'keyword' | 'vector' };

/**
 * ブレインの知識から、質問に関連するチャンクを取得する。
 * キーワード一致を優先しつつ、意味検索の結果で補う。
 */
export async function searchKnowledge(
  avatarId: string,
  query: string,
  limit = 8,
): Promise<KnowledgeHit[]> {
  const db = supabaseAdmin();
  const picked: KnowledgeHit[] = [];
  const seen = new Set<string>();
  const take = (content: string, source: KnowledgeHit['source']) => {
    const key = content.slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);
    picked.push({ content, source });
  };

  // 1) キーワード完全一致。定型文に埋もれた固有語を確実に拾う。
  //    キーワードあたりの件数を絞り、全体でも上限の半分までに留めて、
  //    意味検索の枠を残す。
  const keywords = extractKeywords(query);
  const keywordBudget = Math.max(1, Math.floor(limit / 2));
  for (const kw of keywords) {
    if (picked.length >= keywordBudget) break;
    // ILIKE のワイルドカードとして解釈される文字を無害化する。
    const safe = kw.replace(/[%_\\]/g, (m) => `\\${m}`);
    const { data } = await db
      .from('knowledge_chunks')
      .select('content')
      .eq('avatar_id', avatarId)
      .ilike('content', `%${safe}%`)
      .limit(2);
    for (const row of data ?? []) {
      take(row.content as string, 'keyword');
    }
  }

  // 2) 意味検索。言い換えや文脈での一致を拾う。
  try {
    const [queryEmbedding] = await embedTexts([query]);
    const { data: matches } = await db.rpc('match_knowledge_chunks', {
      query_embedding: queryEmbedding,
      target_avatar_id: avatarId,
      match_count: limit,
    });
    for (const m of (matches as Array<{ content: string }> | null) ?? []) {
      if (picked.length >= limit) break;
      take(m.content, 'vector');
    }
  } catch (e) {
    // 意味検索が失敗しても、キーワード検索の結果は返す(全滅させない)。
    if (picked.length === 0) throw e;
    console.warn(
      '[retrieval] vector search failed, falling back to keyword hits:',
      e instanceof Error ? e.message : String(e),
    );
  }

  return picked.slice(0, limit);
}
