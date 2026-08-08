/**
 * PostgREST の行上限を越えて全件を取得するためのページング補助。
 *
 * Supabase(PostgREST)は 1 レスポンスあたりの行数を既定 1000 件で打ち切る。
 * `.limit()` も `.range()` も付けずに一覧を取ると、1000 件を超えた分は
 * エラーにならず**黙って欠落する**。ゴミ箱・ユーザー管理・監査対象一覧など
 * 「全部見えている前提」の画面でこれが起きると、存在するデータが無いものと
 * して扱われる。
 *
 * そこで range を明示して繰り返し取得する。安全上限(既定 10,000 件)に
 * 達した場合は `truncated: true` を返し、呼び出し側が UI で明示できるように
 * する(黙って切り捨てない)。
 */

export type PagedResult<T> = {
  rows: T[];
  /** 安全上限に達して打ち切った場合 true。 */
  truncated: boolean;
};

/**
 * `build(from, to)` は range を適用済みのクエリを返すこと。
 * 例: `(from, to) => db.from('avatars').select('*').range(from, to)`
 */
export async function fetchAllPages<T>(
  // Supabase のクエリビルダは select() の引数で戻り値の型が変わるため、
  // 呼び出し側で型注釈を強いないよう受け口を緩くしている。
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<PagedResult<T>> {
  const pageSize = opts.pageSize ?? 1000;
  const maxRows = opts.maxRows ?? 10_000;
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1;
    const { data, error } = await build(from, to);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    if (page.length === 0) return { rows, truncated: false };
    rows.push(...page);
    // 返ってきた行数がページサイズ未満なら、それが最後のページ。
    if (page.length < to - from + 1) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}
