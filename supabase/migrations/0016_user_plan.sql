-- =========================================================
-- Per-user plan tier. Limits live in src/lib/plans.ts; this
-- column just records which tier each account is on so the
-- API can enforce caps on brain count, monthly questions etc.
-- New accounts start on 'free'.
-- =========================================================

alter table app_users
  add column if not exists plan text not null default 'free'
  check (plan in ('free', 'starter', 'standard', 'pro'));

create index if not exists app_users_plan_idx on app_users(plan);
