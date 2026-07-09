/**
 * 素材の重複/類似検出のための純粋関数群。
 * 埋め込みベクトル間のコサイン類似度と、閾値でのクラスタリング
 * (Union-Find)を提供する。DB や API には依存しないので単体テスト可能。
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type SimilarPair = { i: number; j: number; sim: number };

/**
 * ベクトル配列から、閾値以上に似ているペアを列挙する(i<j)。
 */
export function similarPairs(
  vectors: number[][],
  threshold: number,
): SimilarPair[] {
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      if (sim >= threshold) pairs.push({ i, j, sim });
    }
  }
  return pairs;
}

/**
 * 類似ペアを連結成分でまとめ、2件以上のクラスタ(インデックス配列)を
 * 返す。各クラスタ内は「まとめてよい候補」。
 */
export function clusterByPairs(
  count: number,
  pairs: SimilarPair[],
): number[][] {
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    // 経路圧縮
    let c = x;
    while (parent[c] !== r) {
      const next = parent[c];
      parent[c] = r;
      c = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (const p of pairs) union(p.i, p.j);

  const groups = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const r = find(i);
    const arr = groups.get(r) ?? [];
    arr.push(i);
    groups.set(r, arr);
  }
  return Array.from(groups.values())
    .filter((g) => g.length >= 2)
    .map((g) => g.sort((a, b) => a - b));
}

/**
 * クラスタ内の最大類似度(代表値・表示用)。
 */
export function clusterMaxSimilarity(
  cluster: number[],
  pairs: SimilarPair[],
): number {
  const set = new Set(cluster);
  let max = 0;
  for (const p of pairs) {
    if (set.has(p.i) && set.has(p.j) && p.sim > max) max = p.sim;
  }
  return max;
}
