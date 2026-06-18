-- =========================================================
-- Free-form folder labels for training material. Materials with the
-- same folder string belong to the same group; NULL = 未分類.
-- =========================================================

alter table training_videos
  add column if not exists folder text;

create index if not exists training_videos_avatar_folder_idx
  on training_videos(avatar_id, folder);
