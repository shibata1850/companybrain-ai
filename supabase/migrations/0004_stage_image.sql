-- =========================================================
-- Separate landscape "stage" image for the live conversation page.
-- The round cover image stays as-is for the avatar thumbnail; this
-- column points at the wider 16:9 crop used as the streaming stage
-- backdrop. Null = fall back to cover_image_path.
-- =========================================================

alter table avatars
  add column if not exists stage_image_path text;
