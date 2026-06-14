-- =========================================================
-- Invite-only access control. Membership in this table is the
-- allowlist: only emails listed here may complete a login, even if a
-- Supabase Auth account exists. role distinguishes admins (who can
-- manage users) from members.
--
-- Bootstrap (run once, then log in):
--   1. Supabase Dashboard → Authentication → Users → Add user
--      (your email + a password, tick auto-confirm)
--   2. insert into app_users(email, role)
--        values ('you@example.com', 'admin');
-- =========================================================

create table if not exists app_users (
  email      text primary key,
  role       text not null default 'member',   -- 'admin' | 'member'
  created_at timestamptz not null default now()
);
