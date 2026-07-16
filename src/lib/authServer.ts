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
 * Authorize the current user against one brain.
 *
 * - 所有者(owner): フルアクセス(利用・編集・削除)。access='owner'。
 * - 共有相手(shared): 同じ会社のメンバーで、そのブレインが自分に共有
 *   されている場合、閲覧・会話のみ可。access='shared'。
 * - それ以外: 403。管理者(role='admin')も他人のブレインには入れない
 *   (監査ログのみ)。
 *
 * 編集・削除系のルートは requireOwner:true を渡すこと。共有相手(shared)は
 * その場合 403 になり、素材追加・編集・削除などができない。
 */
export async function authorizeAvatar(
  avatarId: string,
  opts: { requireOwner?: boolean } = {},
): Promise<
  | {
      ok: true;
      me: AppUser;
      fromRequest: boolean;
      access: 'owner' | 'shared';
      ownerEmail: string;
    }
  | { ok: false; status: number }
> {
  const me = await getAppUser();
  if (!me) return { ok: false, status: 401 };

  const db = supabaseAdmin();
  const { data } = await db
    .from('avatars')
    .select('owner_email, request_id, shared_with_org, deleted_at')
    .eq('id', avatarId)
    .single();
  if (!data) return { ok: false, status: 404 };

  const ownerEmail = (data.owner_email ?? '').toLowerCase();
  const isOwner = ownerEmail === me.email.toLowerCase();
  if (isOwner) {
    return {
      ok: true,
      me,
      fromRequest: data.request_id != null,
      access: 'owner',
      ownerEmail,
    };
  }

  // 編集系は所有者専用。共有相手は到達できない。
  if (opts.requireOwner) return { ok: false, status: 403 };

  // 所有者がゴミ箱に入れた(soft delete)ブレインには、共有相手は
  // アクセスできない。所有者による削除がそのまま共有解除になる。
  if ((data as { deleted_at?: string | null }).deleted_at != null) {
    return { ok: false, status: 403 };
  }

  // 共有アクセスの判定(閲覧・会話のみ)。同一組織 かつ 共有対象のとき。
  const sharedOk = await isBrainSharedWith(
    db,
    avatarId,
    ownerEmail,
    (data as { shared_with_org?: boolean }).shared_with_org === true,
    me,
  );
  if (!sharedOk) return { ok: false, status: 403 };
  return {
    ok: true,
    me,
    fromRequest: data.request_id != null,
    access: 'shared',
    ownerEmail,
  };
}

/**
 * ブレインが「自分に共有されているか」を判定する。共有は同一組織内に
 * 限る(所有者と自分が同じ org_id)。org 全体共有(shared_with_org)か、
 * 個別共有(avatar_shares に自分の行)のいずれかで true。
 * 0027 未適用の環境では shared_with_org / avatar_shares が無いため、
 * エラーは握りつぶして「共有なし」とする(既存の非共有挙動に一致)。
 */
async function isBrainSharedWith(
  db: ReturnType<typeof supabaseAdmin>,
  avatarId: string,
  ownerEmail: string,
  sharedWithOrg: boolean,
  me: AppUser,
): Promise<boolean> {
  if (!me.org_id) return false; // 個人アカウントは共有の対象外
  // 管理者(プラットフォーム管理者)は他人のブレインに共有で入れない。
  // 通常 admin は org_id=null だが、万一 org に割り当てられても監査のみ
  // という原則を、データ衛生だけに頼らずコードで担保する。
  if (me.role === 'admin') return false;
  // 所有者が同じ会社に属していること。
  const { data: owner } = await db
    .from('app_users')
    .select('org_id')
    .eq('email', ownerEmail)
    .single();
  const ownerOrg = (owner as { org_id?: string | null } | null)?.org_id ?? null;
  if (!ownerOrg || ownerOrg !== me.org_id) return false;

  if (sharedWithOrg) return true;

  const { data: share, error } = await db
    .from('avatar_shares')
    .select('id')
    .eq('avatar_id', avatarId)
    .eq('shared_with_email', me.email.toLowerCase())
    .maybeSingle();
  if (error) return false; // 0027 未適用など
  return !!share;
}
