import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from './env';
import { supabaseAdmin } from './supabase';

/**
 * Supabase client bound to the request cookies, for route handlers and
 * server components. Reads/writes the auth session cookie so login
 * state persists across requests.
 */
export function supabaseRoute() {
  const cookieStore = cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        toSet: { name: string; value: string; options?: Record<string, unknown> }[],
      ) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // called from a Server Component render — safe to ignore,
          // middleware refreshes the session cookie instead.
        }
      },
    },
  });
}

export type AppUser = {
  email: string;
  role: 'admin' | 'member';
};

/**
 * Resolve the current authenticated + allowlisted user, or null.
 * A valid Supabase session is not enough — the email must also be in
 * app_users (the invite allowlist).
 */
export async function getAppUser(): Promise<AppUser | null> {
  const supa = supabaseRoute();
  const {
    data: { user },
  } = await supa.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) return null;

  const db = supabaseAdmin();
  const { data } = await db
    .from('app_users')
    .select('email, role')
    .eq('email', email)
    .single();
  if (!data) return null;
  return { email: data.email, role: data.role === 'admin' ? 'admin' : 'member' };
}
