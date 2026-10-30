import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Auth のユーザーをメールアドレスで探す。
 *
 * `auth.admin.listUsers()` を引数なしで呼ぶと最初の1ページ
 * (既定 perPage=50)しか返らず、51人目以降のユーザーが
 * 「アカウントが見つかりません」になる。ここで明示的に
 * ページングして全ページから探す。
 */
export async function findAuthUserByEmail(
  db: SupabaseClient,
  email: string,
): Promise<{ id: string; email?: string } | null> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return { id: hit.id, email: hit.email ?? undefined };
    if (users.length < perPage) return null; // 最終ページまで見た
  }
  return null;
}
