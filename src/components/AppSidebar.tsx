'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavBadges, isAppRoute } from './useNavBadges';

type SidebarBrain = {
  id: string;
  name: string;
  cover_url: string | null;
  shared?: boolean;
};

type Me = {
  role?: 'admin' | 'member';
  org_role?: 'company_admin' | 'member' | null;
};

/**
 * PC(lg以上)の常設サイドバー(Notion / Slack 型)。
 *
 * - どの画面からでもブレインの切り替えを1クリックにする
 * - 依頼・お知らせ・マイページと、権限者には管理系の入口を常設する
 *   (従来はマイページの奥で2クリック以上の深さだった)
 * - スマホは従来どおり下部ナビ。このコンポーネントは lg 未満では
 *   何も描画しない(hidden)
 * - ランディング/ログイン等のマーケ画面では出さない
 */
export default function AppSidebar({ show }: { show: boolean }) {
  const pathname = usePathname() || '';
  const { unread, requestCount } = useNavBadges(show);
  const [brains, setBrains] = useState<SidebarBrain[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const lastLoadRef = useRef(0);

  const loadBrains = useCallback(async (force?: boolean) => {
    // 画面遷移のたびに全件を引き直すと重いので、30秒は再利用する。
    if (!force && Date.now() - lastLoadRef.current < 30_000) return;
    try {
      const res = await fetch('/api/avatars', { cache: 'no-store' });
      const json = (await res.json()) as { avatars?: SidebarBrain[] };
      if (res.ok) {
        setBrains(json.avatars ?? []);
        lastLoadRef.current = Date.now();
      }
    } catch {
      // サイドバーは補助導線。失敗しても本体の画面は生きているので黙る。
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    void loadBrains(true);
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setMe((j?.user as Me) ?? null))
      .catch(() => {});
    const onFocus = () => void loadBrains();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [show, loadBrains]);

  // 遷移のたび(=作成・削除の直後を含む)に、30秒スロットル付きで更新。
  useEffect(() => {
    if (show) void loadBrains();
  }, [pathname, show, loadBrains]);

  if (!show || !isAppRoute(pathname)) return null;

  const isAdmin = me?.role === 'admin';
  const isCompanyAdmin = me?.org_role === 'company_admin';

  const linkCls = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
      active
        ? 'bg-white font-bold text-neutral-900 shadow-sm'
        : 'text-neutral-600 hover:bg-white/70 hover:text-neutral-900'
    }`;

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col overflow-y-auto border-r border-neutral-200/70 bg-white/50 px-3 py-4 backdrop-blur lg:flex">
      <Link
        href="/avatars/new"
        className="mb-3 flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-sm font-bold text-white transition hover:bg-neutral-700"
      >
        ＋ 新しいブレイン
      </Link>

      <p className="mb-1 px-2 text-xs font-bold uppercase tracking-wider text-neutral-400">
        ブレイン
      </p>
      <div className="space-y-0.5">
        {brains.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-neutral-400">
            まだブレインがありません
          </p>
        )}
        {brains.map((b) => {
          const active =
            pathname === `/avatars/${b.id}` ||
            pathname.startsWith(`/avatars/${b.id}/`);
          return (
            <Link key={b.id} href={`/avatars/${b.id}`} className={linkCls(active)}>
              <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-neutral-200">
                {b.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.cover_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
              {b.shared && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                  共有
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto space-y-0.5 pt-4">
        <Link
          href="/requests"
          className={linkCls(pathname.startsWith('/requests'))}
        >
          <span className="min-w-0 flex-1 truncate">作成を依頼</span>
          {requestCount > 0 && (
            <span className="shrink-0 rounded-full bg-neutral-200 px-1.5 py-0.5 text-xs font-bold text-neutral-700">
              {requestCount}
            </span>
          )}
        </Link>
        <Link
          href="/notifications"
          className={linkCls(pathname.startsWith('/notifications'))}
        >
          <span className="min-w-0 flex-1 truncate">お知らせ</span>
          {unread > 0 && (
            <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>
        <Link href="/mypage" className={linkCls(pathname.startsWith('/mypage'))}>
          マイページ
        </Link>

        {(isAdmin || isCompanyAdmin) && (
          <>
            <p className="px-2 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
              管理
            </p>
            {isCompanyAdmin && !isAdmin && (
              <Link href="/org" className={linkCls(pathname.startsWith('/org'))}>
                会社管理
              </Link>
            )}
            {isAdmin && (
              <>
                <Link
                  href="/admin/users"
                  className={linkCls(pathname.startsWith('/admin/users'))}
                >
                  ユーザー管理
                </Link>
                <Link
                  href="/admin/orgs"
                  className={linkCls(pathname.startsWith('/admin/orgs'))}
                >
                  組織管理
                </Link>
                <Link
                  href="/admin/avatars"
                  className={linkCls(pathname.startsWith('/admin/avatars'))}
                >
                  ブレイン管理
                </Link>
                <Link
                  href="/audit"
                  className={linkCls(pathname.startsWith('/audit'))}
                >
                  監査ログ
                </Link>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
