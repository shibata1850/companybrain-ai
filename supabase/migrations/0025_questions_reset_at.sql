-- 管理者が手動で「今月の質問回数」をリセットするための起点時刻。
--
-- 質問回数は audit_logs(role='user')の件数で数えているため、ログを
-- 削除せずに集計の起点だけをずらす。questions_reset_at が設定されて
-- いれば、その時刻(と月初 JST のうち新しい方)以降の質問だけを数える。
alter table app_users
  add column if not exists questions_reset_at timestamptz;
