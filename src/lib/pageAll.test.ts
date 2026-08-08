import { describe, it, expect } from 'vitest';
import { fetchAllPages } from './pageAll';

/**
 * ページングは境界を1つ間違えるとデータが欠落する。しかも「エラーにならず
 * 静かに消える」ため画面上は正常に見えてしまう。取りこぼしと重複の両方を
 * テストで固定する。
 */

/** 指定件数のデータを返す偽クエリ。ページサイズは range で決まる。 */
function fakeSource(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const build = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: all.slice(from, to + 1), error: null };
  };
  return { build, calls };
}

describe('fetchAllPages', () => {
  it('1ページに収まる件数をそのまま返す', async () => {
    const { build } = fakeSource(10);
    const { rows, truncated } = await fetchAllPages<{ id: number }>(build, { pageSize: 100 });
    expect(rows).toHaveLength(10);
    expect(truncated).toBe(false);
  });

  it('ページ境界ちょうどの件数でも取りこぼさない', async () => {
    const { build } = fakeSource(300);
    const { rows, truncated } = await fetchAllPages<{ id: number }>(build, { pageSize: 100 });
    expect(rows).toHaveLength(300);
    expect(new Set(rows.map((r) => r.id)).size).toBe(300); // 重複なし
    expect(truncated).toBe(false);
  });

  it('境界をまたぐ件数でも全件そろう', async () => {
    const { build } = fakeSource(1001); // PostgREST 既定の1000超え
    const { rows } = await fetchAllPages<{ id: number }>(build, { pageSize: 1000 });
    expect(rows).toHaveLength(1001);
    expect(rows[1000].id).toBe(1000);
  });

  it('0件でも落ちない', async () => {
    const { build } = fakeSource(0);
    const { rows, truncated } = await fetchAllPages<{ id: number }>(build, { pageSize: 100 });
    expect(rows).toEqual([]);
    expect(truncated).toBe(false);
  });

  it('安全上限に達したら truncated=true を返す(黙って切り捨てない)', async () => {
    const { build } = fakeSource(5000);
    const { rows, truncated } = await fetchAllPages<{ id: number }>(build, {
      pageSize: 100,
      maxRows: 300,
    });
    expect(rows).toHaveLength(300);
    expect(truncated).toBe(true);
  });

  it('取得順を保つ', async () => {
    const { build } = fakeSource(250);
    const { rows } = await fetchAllPages<{ id: number }>(build, { pageSize: 100 });
    expect(rows.map((r) => r.id).slice(0, 3)).toEqual([0, 1, 2]);
    expect(rows[249].id).toBe(249);
  });

  it('エラーは握りつぶさず投げる', async () => {
    await expect(
      fetchAllPages(async () => ({
        data: null,
        error: { message: 'db down' },
      })),
    ).rejects.toThrow('db down');
  });
});
