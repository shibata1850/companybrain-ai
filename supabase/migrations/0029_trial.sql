-- 14日間の体験(トライアル)。営業(プラットフォーム管理者)が管理画面から
-- 手動で付与する。trial_until が未来の間だけ、個人アカウントは trial_plan の
-- 上限で動作する(組織所属者はシート上限が優先)。期限が過ぎれば自動で
-- 本来のプランに戻る。列を消す必要はない(過去の付与履歴として残る)。
alter table app_users
  add column if not exists trial_plan text,
  add column if not exists trial_until timestamptz;
