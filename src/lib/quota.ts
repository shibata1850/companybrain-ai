/**
 * 月次クォータ(質問回数・音声分数)の起点 = 日本時間の毎月1日 0:00。
 *
 * Vercel のサーバーは UTC で動くため、素の setDate(1)/setHours(0) だと
 * 「日本時間の1日 9:00」がリセット境界になってしまう。ユーザーは日本の
 * 事業者なので、JST の月初に揃える。
 */
export function quotaMonthStart(now: Date = new Date()): Date {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  return new Date(
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - JST_OFFSET_MS,
  );
}
