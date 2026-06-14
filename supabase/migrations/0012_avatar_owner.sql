-- =========================================================
-- Per-user brain ownership. Each avatar belongs to the user who
-- created it; the brain list shows only your own, while admins get a
-- dedicated management view of everyone's. Existing brains (created
-- before auth) are assigned to the bootstrap admin.
-- =========================================================

alter table avatars
  add column if not exists owner_email text;

create index if not exists avatars_owner_idx on avatars(owner_email);

-- Backfill: hand every existing brain to the primary admin so nothing
-- becomes orphaned when ownership filtering switches on.
-- NOTE: adjust the email below if your bootstrap admin differs.
update avatars
  set owner_email = 'shibata1850@gmail.com'
  where owner_email is null;
