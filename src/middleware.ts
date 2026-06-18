import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Gate the whole app behind a Supabase session. Unauthenticated
 * visitors are redirected to /login. The allowlist (app_users) is
 * enforced at login time; here we only require a valid session.
 *
 * Exempt paths:
 *   /login              the login screen itself
 *   /api/auth/*         login / logout / me endpoints
 *   /api/ingest/*       Make.com etc. authenticate with a bearer key
 *   static assets       handled by the matcher below
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/ingest');
  if (isPublic) return NextResponse.next();

  let res = NextResponse.next({ request: req });

  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(
          toSet: { name: string; value: string; options?: Record<string, unknown> }[],
        ) {
          for (const { name, value } of toSet) {
            req.cookies.set(name, value);
          }
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of toSet) {
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    // API routes get a 401; pages get redirected to the login screen.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
