-- =========================================================
-- Per-user profile picture. Path into the storage bucket.
-- Empty means use the initial-letter fallback tile.
-- =========================================================

alter table app_users
  add column if not exists avatar_path text;
