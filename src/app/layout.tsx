import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import NavProgress from '@/components/NavProgress';
import PageTransition from '@/components/PageTransition';
import BottomNav from '@/components/BottomNav';
import HeaderNav from '@/components/HeaderNav';
import LoginAnnouncements from '@/components/LoginAnnouncements';
import './globals.css';

export const metadata: Metadata = {
  title: 'CompanyBrain AI',
  description:
    '人物の動画を学習させ、その人として質問に答える動画を自動生成する社内ブレイン。',
};

async function hasSession(): Promise<boolean> {
  const store = cookies();
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll() {
          // read-only here
        },
      },
    },
  );
  const {
    data: { user },
  } = await supa.auth.getUser();
  return !!user;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const loggedIn = await hasSession();
  return (
    <html lang="ja">
      <body
        className={`min-h-screen text-neutral-900 ${
          loggedIn ? 'app-bg' : 'bg-white'
        }`}
      >
        <NavProgress />
        <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
            <Link
              href={loggedIn ? '/dashboard' : '/'}
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
              <HeaderNav show={loggedIn} />
              {!loggedIn && (
                <Link
                  href="/login"
                  className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition duration-200 hover:bg-neutral-700 active:scale-[0.98]"
                >
                  ログイン
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main
          className={`mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 ${
            loggedIn
              ? 'pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-8'
              : ''
          }`}
        >
          <PageTransition>{children}</PageTransition>
        </main>
        <BottomNav show={loggedIn} />
        {loggedIn && <LoginAnnouncements />}
      </body>
    </html>
  );
}
