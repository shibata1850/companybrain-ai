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
  // 折りたたみ(しまう)。会話を広く使いたいときに細いレールへ畳む。
  // 端末ごとの好みなので localStorage に記憶する。
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem('cb-sidebar-collapsed') === '1');
    } catch {
      // storage 無効環境では常に展開
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        window.localStorage.setItem('cb-sidebar-collapsed', v ? '0' : '1');
      } catch {
        // ignore
      }
      return !v;
    });
  };

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

  // 畳んだ状態: 細いレール。ブレインはアイコンだけで切替でき、
  // ワンクリックで元に戻せる。
  if (collapsed) {
    return (
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-neutral-200/70 bg-white/50 py-3 backdrop-blur lg:flex">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="サイドバーを開く"
          title="サイドバーを開く"
          className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 transition hover:bg-white hover:text-neutral-900"
        >
          <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M4.5 2.5L8 6l-3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <Link
          href="/avatars/new"
          aria-label="新しいブレイン"
          title="新しいブレイン"
          className="grid h-9 w-9 place-items-center rounded-lg bg-neutral-900 text-sm font-bold text-white transition hover:bg-neutral-700"
        >
          ＋
        </Link>
        <div className="flex w-full flex-col items-center gap-1.5 pt-1">
          {brains.slice(0, 12).map((b) => {
            const active =
              pathname === `/avatars/${b.id}` ||
              pathname.startsWith(`/avatars/${b.id}/`);
            return (
              <Link
                key={b.id}
                href={`/avatars/${b.id}`}
                title={b.name}
                className={`h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-200 ring-2 transition ${
                  active ? 'ring-neutral-900' : 'ring-transparent hover:ring-neutral-300'
                }`}
              >
                {b.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.cover_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-xs font-bold text-neutral-500">
                    {b.name.slice(0, 1)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col overflow-y-auto border-r border-neutral-200/70 bg-white/50 px-3 py-4 backdrop-blur lg:flex">
      <div className="mb-3 flex items-center gap-2">
        <Link
          href="/avatars/new"
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-sm font-bold text-white transition hover:bg-neutral-700"
        >
          ＋ 新しいブレイン
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="サイドバーをしまう"
          title="サイドバーをしまう"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-400 transition hover:bg-white hover:text-neutral-900"
        >
          <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M7.5 2.5L4 6l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

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
                <Link
                  href="/admin/kiosk"
                  className={linkCls(pathname.startsWith('/admin/kiosk'))}
                >
                  展示モード
                </Link>
                <Link
                  href="/admin/maintenance"
                  className={linkCls(pathname.startsWith('/admin/maintenance'))}
                >
                  メンテナンス
                </Link>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
