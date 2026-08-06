import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from './gemini';

/**
 * 埋め込み生成の並列化ヘルパーの検証。
 *
 * 埋め込みベクトルは入力チャンクと1対1で対応しており、順序が狂うと
 * 「別の文章のベクトル」が保存されて RAG の検索結果が壊れる。並列化で
 * 最も壊しやすいのがこの順序なので、テストで固定する。
 */
describe('mapWithConcurrency', () => {
  it('入力の順序どおりに結果を返す(完了順ではない)', async () => {
    const input = [50, 10, 30, 0, 20];
    // 遅延をばらけさせ、完了順と入力順を意図的にずらす
    const out = await mapWithConcurrency(input, 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return `v${ms}`;
    });
    expect(out).toEqual(['v50', 'v10', 'v30', 'v0', 'v20']);
  });

  it('同時実行数が上限を超えない', async () => {
    let running = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await mapWithConcurrency(items, 4, async (i) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return i;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // 実際に並行している
  });

  it('全件を処理する(取りこぼさない)', async () => {
    const items = Array.from({ length: 57 }, (_, i) => i);
    const out = await mapWithConcurrency(items, 6, async (i) => i * 2);
    expect(out).toHaveLength(57);
    expect(out[0]).toBe(0);
    expect(out[56]).toBe(112);
  });

  it('要素が上限より少なくても動く', async () => {
    const out = await mapWithConcurrency([1, 2], 10, async (n) => n + 1);
    expect(out).toEqual([2, 3]);
  });

  it('空配列は空を返す', async () => {
    expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([]);
  });

  it('いずれかが失敗したら例外を伝播する(モデルのフォールバックが働くため)', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('embedding failed');
        return n;
      }),
    ).rejects.toThrow('embedding failed');
  });
});
