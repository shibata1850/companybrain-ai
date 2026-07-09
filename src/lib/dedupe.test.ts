import { describe, expect, it } from 'vitest';
import {
  clusterByPairs,
  clusterMaxSimilarity,
  cosineSimilarity,
  similarPairs,
} from './dedupe';

describe('cosineSimilarity', () => {
  it('同一ベクトルは 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });
  it('直交は 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it('長さ違い・空は 0', () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('similarPairs / clusterByPairs', () => {
  const vfrom = (x: number, y: number) => [x, y];
  // 0,1 はほぼ同一 / 2,3 はほぼ同一 / 4 は孤立
  const vectors = [
    vfrom(1, 0.01),
    vfrom(1, 0.02),
    vfrom(0.01, 1),
    vfrom(0.02, 1),
    vfrom(1, 1),
  ];

  it('閾値以上のペアだけ拾う', () => {
    const pairs = similarPairs(vectors, 0.99);
    // (0,1) と (2,3) は拾い、(0,2) などは拾わない
    const keys = pairs.map((p) => `${p.i}-${p.j}`);
    expect(keys).toContain('0-1');
    expect(keys).toContain('2-3');
    expect(keys).not.toContain('0-2');
  });

  it('連結成分で2件以上のクラスタを返す', () => {
    const pairs = similarPairs(vectors, 0.99);
    const clusters = clusterByPairs(vectors.length, pairs);
    // {0,1} と {2,3} の2クラスタ、4は単独なので除外
    expect(clusters).toHaveLength(2);
    expect(clusters).toContainEqual([0, 1]);
    expect(clusters).toContainEqual([2, 3]);
  });

  it('推移的に連結する(0-1, 1-2 なら {0,1,2})', () => {
    const pairs = [
      { i: 0, j: 1, sim: 0.99 },
      { i: 1, j: 2, sim: 0.99 },
    ];
    const clusters = clusterByPairs(3, pairs);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual([0, 1, 2]);
  });

  it('clusterMaxSimilarity はクラスタ内の最大値', () => {
    const pairs = [
      { i: 0, j: 1, sim: 0.95 },
      { i: 1, j: 2, sim: 0.98 },
    ];
    expect(clusterMaxSimilarity([0, 1, 2], pairs)).toBeCloseTo(0.98);
  });
});
