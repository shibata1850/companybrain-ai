import { supabaseAdmin } from './supabase';

/**
 * 学習素材から抽出した「振る舞いルール」の保存と収集。
 *
 * ルールは knowledge_chunks(RAG 検索)とは別に training_videos.
 * extracted_rules に持ち、会話セッションのシステム指示へ毎回注入する。
 * これにより「検索でたまたまヒットしたときだけ指示に従う」という
 * 不安定さを無くす。
 *
 * extracted_rules 列はマイグレーション(0023)適用前の環境には無いため、
 * 保存・収集とも失敗を握りつぶして機能ごと無効化する(学習や会話
 * 本体は絶対に巻き込まない)。列欠如(42703)を一度検知したら
 * プロセス内で記憶し、以後の無駄なクエリとログ連発を避ける。
 */

let columnMissing = false;

function isMissingColumnError(message: string | undefined): boolean {
  return !!message && /extracted_rules|42703/.test(message);
}

/** 保存できたら true。列が無い環境では false(機能オフ)。 */
export async function saveExtractedRules(
  videoId: string,
  rules: string[],
): Promise<boolean> {
  if (columnMissing) return false;
  const db = supabaseAdmin();
  const value =
    rules.length > 0 ? rules.map((r) => `- ${r}`).join('\n') : null;
  const { error } = await db
    .from('training_videos')
    .update({ extracted_rules: value })
    .eq('id', videoId);
  if (error) {
    if (isMissingColumnError(error.message)) columnMissing = true;
    console.warn(
      '[materialRules] extracted_rules の保存に失敗(0023 マイグレーション未適用?):',
      error.message,
    );
    return false;
  }
  return true;
}

/** ブレインの ready 素材からルールを集め、重複除去して1ブロックの
 *  テキスト(行頭 "- ")にする。無ければ空文字。
 *  学習順(created_at 昇順)で採用し、上限超過時は後から学習した
 *  ルールを行単位で落とす(文の途中で切らない)。 */
export async function collectMaterialRules(avatarId: string): Promise<string> {
  if (columnMissing) return '';
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('training_videos')
    .select('extracted_rules, created_at')
    .eq('avatar_id', avatarId)
    .eq('status', 'ready')
    .not('extracted_rules', 'is', null)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error || !data) {
    if (error) {
      if (isMissingColumnError(error.message)) columnMissing = true;
      console.warn(
        '[materialRules] extracted_rules の取得に失敗(0023 マイグレーション未適用?):',
        error.message,
      );
    }
    return '';
  }
  // システム指示の肥大化を防ぐ上限。行単位で収め、途中切断で意味が
  // 反転した断片(例: 「〜してはいけない」→「〜して」)を作らない。
  const MAX_CHARS = 1500;
  const seen = new Set<string>();
  const kept: string[] = [];
  let total = 0;
  let dropped = 0;
  for (const row of data) {
    for (const line of String(row.extracted_rules ?? '').split('\n')) {
      const t = line.replace(/^-\s*/, '').trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      const entry = `- ${t}`;
      if (total + entry.length + 1 > MAX_CHARS) {
        dropped++;
        continue;
      }
      kept.push(entry);
      total += entry.length + 1;
    }
  }
  if (kept.length === 0) return '';
  if (dropped > 0) {
    kept.push(`- (ルールが多すぎるため、後から学習した ${dropped} 件は省略)`);
  }
  return kept.join('\n');
}
