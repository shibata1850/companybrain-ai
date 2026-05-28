import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'CompanyBrain AI',
  description:
    '人物の動画を学習させ、その人として質問に答える動画を自動生成する社内ブレイン。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-white text-neutral-900">
        <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-neutral-900 text-[11px] font-bold text-white">
                CB
              </span>
              <span className="text-[15px] font-semibold tracking-tight">
                CompanyBrain
              </span>
            </Link>
            <Link
              href="/avatars/new"
              className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
            >
              + 新しいブレイン
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
