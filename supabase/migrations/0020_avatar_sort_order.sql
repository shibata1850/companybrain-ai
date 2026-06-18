-- =========================================================
-- Per-user brain ordering. Lets the owner drag-and-drop their
-- brains into any order on the dashboard. Default 0 means
-- "show in created_at desc order" (the previous behaviour) until
-- the owner actually rearranges.
-- =========================================================

alter table avatars
  add column if not exists sort_order integer not null default 0;

create index if not exists avatars_owner_sort_idx
  on avatars(owner_email, sort_order desc, created_at desc);
