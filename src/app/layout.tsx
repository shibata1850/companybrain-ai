import type { Metadata } from 'next';
import Link from 'next/link';
import NavProgress from '@/components/NavProgress';
import PageTransition from '@/components/PageTransition';
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
        <NavProgress />
        <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
            <Link
              href="/"
              className="group flex items-center gap-2 transition"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-neutral-900 text-[11px] font-bold text-white transition duration-200 group-hover:scale-105">
                CB
              </span>
              <span className="text-[15px] font-semibold tracking-tight">
                CompanyBrain
              </span>
            </Link>
            <nav className="flex items-center gap-2">
              <Link
                href="/trash"
                className="rounded-full px-3 py-1.5 text-xs font-medium text-neutral-500 transition duration-200 hover:bg-neutral-100 hover:text-neutral-900"
              >
                ゴミ箱
              </Link>
              <Link
                href="/avatars/new"
                className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition duration-200 hover:bg-neutral-700 active:scale-[0.98]"
              >
                + 新しいブレイン
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </body>
    </html>
  );
}
