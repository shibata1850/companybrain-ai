-- =========================================================
-- Display names. Two independent labels per user that never affect
-- each other:
--   display_name : the user's own name for themselves. Only the user
--                  sees and edits it.
--   admin_label  : a note an admin attaches to a user so the admin can
--                  recognise them. Only admins see and edit it; the
--                  user is never shown it and it never overrides their
--                  own display_name.
-- =========================================================

alter table app_users
  add column if not exists display_name text;

alter table app_users
  add column if not exists admin_label text;
