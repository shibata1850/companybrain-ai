import Link from 'next/link';

/**
 * 法的文書(利用規約・プライバシーポリシー・特商法表記)の共通レイアウト。
 * 公開ページ(ログイン不要)。読みやすさ優先の一段組み。
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** 制定日・最終改定日の表示文字列。 */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
        {title}
      </h1>
      <p className="mt-2 text-xs text-neutral-500">{updated}</p>
      <div className="mt-8 space-y-8">{children}</div>
      <div className="mt-12 flex flex-wrap gap-4 border-t border-neutral-200 pt-6 text-xs text-neutral-500">
        <Link href="/" className="hover:text-neutral-900">
          トップページ
        </Link>
        <Link href="/terms" className="hover:text-neutral-900">
          利用規約
        </Link>
        <Link href="/privacy" className="hover:text-neutral-900">
          プライバシーポリシー
        </Link>
        <Link href="/legal" className="hover:text-neutral-900">
          特定商取引法に基づく表記
        </Link>
        <Link href="/security" className="hover:text-neutral-900">
          セキュリティ
        </Link>
      </div>
    </div>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-bold text-neutral-900">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-700">
        {children}
      </div>
    </section>
  );
}

/** 箇条書き(番号なし)。 */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

/** 定義や特商法のような「項目名: 内容」の表。 */
export function LegalTable({
  rows,
}: {
  rows: Array<[string, React.ReactNode]>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr
              key={i}
              className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}
            >
              <th className="w-36 shrink-0 border-r border-neutral-200 px-4 py-3 text-left align-top text-xs font-semibold text-neutral-600 sm:w-44">
                {k}
              </th>
              <td className="px-4 py-3 align-top leading-relaxed text-neutral-700">
                {v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
