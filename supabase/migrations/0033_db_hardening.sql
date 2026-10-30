-- 0033: DB セキュリティ微修正(Supabase security advisor 対応)
-- 1) 関数の search_path を固定する(role mutable search_path 警告)。
--    search_path を固定しないと、呼び出しロールの設定次第で別スキーマの
--    同名オブジェクトに差し替えられる余地が残る。
alter function public.match_knowledge_chunks(vector, uuid, integer)
  set search_path = public, extensions;
alter function public.copy_brain(uuid, text, uuid)
  set search_path = public;
alter function public.enforce_org_seats()
  set search_path = public;

-- 2) rls_auto_enable(イベントトリガー関数・SECURITY DEFINER)を
--    anon / authenticated から実行不可にする。PostgREST の
--    /rest/v1/rpc 経由で露出していた(実害は小さいが不要な露出)。
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
