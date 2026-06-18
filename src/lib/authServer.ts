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
  /** The user's own chosen name (only they see/edit it). */
  display_name: string | null;
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
    .select('email, role, display_name, suspended_at')
    .eq('email', email)
    .single();
  if (!data) return null;
  // Suspended accounts are treated as if they don't exist for the rest
  // of the app — no brain access, no audit visibility, no requests.
  if (data.suspended_at) return null;
  return {
    email: data.email,
    role: data.role === 'admin' ? 'admin' : 'member',
    display_name: data.display_name ?? null,
  };
}

/**
 * Authorize the current user against one brain for USE / EDIT / DELETE.
 * A brain belongs solely to its creator — admins have NO access to
 * other people's brains (their oversight is the audit log only). The
 * owner is the only one who passes.
 */
export async function authorizeAvatar(
  avatarId: string,
): Promise<
  { ok: true; me: AppUser } | { ok: false; status: number }
> {
  const me = await getAppUser();
  if (!me) return { ok: false, status: 401 };

  const db = supabaseAdmin();
  const { data } = await db
    .from('avatars')
    .select('owner_email')
    .eq('id', avatarId)
    .single();
  if (!data) return { ok: false, status: 404 };
  if (
    (data.owner_email ?? '').toLowerCase() !== me.email.toLowerCase()
  ) {
    return { ok: false, status: 403 };
  }
  return { ok: true, me };
}
