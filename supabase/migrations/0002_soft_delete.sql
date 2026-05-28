-- =========================================================
-- Add soft-delete (trash) support to avatars.
-- A row with deleted_at = null is active; anything else is in the trash.
-- =========================================================

alter table avatars
  add column if not exists deleted_at timestamptz;

create index if not exists avatars_deleted_at_idx on avatars(deleted_at);
