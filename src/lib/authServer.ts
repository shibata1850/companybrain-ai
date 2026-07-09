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
  /** Storage path of the user's profile picture, or null. */
  avatar_path: string | null;
  /** 所属組織(個人アカウントは null)。 */
  org_id: string | null;
  /** 組織内の役割('company_admin' = 会社管理者 / 'member')。 */
  org_role: 'company_admin' | 'member' | null;
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
  // org_id / org_role(0026)が未適用の環境でも動くよう、失敗時は従来列で
  // 取り直す。
  const cols = 'email, role, display_name, suspended_at, avatar_path, org_id, org_role';
  const legacy = 'email, role, display_name, suspended_at, avatar_path';
  const full = await db.from('app_users').select(cols).eq('email', email).single();
  const res = full.error
    ? await db.from('app_users').select(legacy).eq('email', email).single()
    : full;
  const data = res.data as
    | {
        email: string;
        role: string;
        display_name: string | null;
        suspended_at: string | null;
        avatar_path: string | null;
        org_id?: string | null;
        org_role?: string | null;
      }
    | null;
  if (!data) return null;
  // Suspended accounts are treated as if they don't exist for the rest
  // of the app — no brain access, no audit visibility, no requests.
  if (data.suspended_at) return null;
  return {
    email: data.email,
    role: data.role === 'admin' ? 'admin' : 'member',
    display_name: data.display_name ?? null,
    avatar_path: data.avatar_path ?? null,
    org_id: data.org_id ?? null,
    org_role:
      data.org_role === 'company_admin'
        ? 'company_admin'
        : data.org_id
        ? 'member'
        : null,
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
  | { ok: true; me: AppUser; fromRequest: boolean }
  | { ok: false; status: number }
> {
  const me = await getAppUser();
  if (!me) return { ok: false, status: 401 };

  const db = supabaseAdmin();
  const { data } = await db
    .from('avatars')
    .select('owner_email, request_id')
    .eq('id', avatarId)
    .single();
  if (!data) return { ok: false, status: 404 };
  if (
    (data.owner_email ?? '').toLowerCase() !== me.email.toLowerCase()
  ) {
    return { ok: false, status: 403 };
  }
  // request_id != null ⇒ this brain was built by an admin on request
  // and gifted; the owner may use it but not add learning material.
  return { ok: true, me, fromRequest: data.request_id != null };
}
