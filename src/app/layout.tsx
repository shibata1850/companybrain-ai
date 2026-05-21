import type { Metadata } from 'next';
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
      <body className="min-h-screen antialiased">
        <header className="border-b border-white/10">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <a href="/" className="text-lg font-semibold tracking-tight">
              CompanyBrain<span className="text-indigo-400"> AI</span>
            </a>
            <a
              href="/avatars/new"
              className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400"
            >
              新しいブレインを作る
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
