-- =========================================================
-- User suspension. Distinct from utilization 停止 (delete):
-- suspended users keep their account, brains and history; they
-- simply can't log in or use existing sessions until reactivated.
-- =========================================================

alter table app_users
  add column if not exists suspended_at timestamptz;

create index if not exists app_users_suspended_idx
  on app_users(suspended_at) where suspended_at is not null;
