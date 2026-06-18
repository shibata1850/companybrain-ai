-- =========================================================
-- Allow training material that isn't a video file: plain text notes,
-- pasted documents, etc.
-- =========================================================

-- The training_videos table used to require a storage path because every
-- row was backed by an uploaded video. Text-only entries have no file,
-- so make storage_path nullable.
alter table training_videos
  alter column storage_path drop not null;

-- Distinguish how the entry was added so the UI can label it.
alter table training_videos
  add column if not exists source_type text not null default 'video';

create index if not exists training_videos_source_type_idx
  on training_videos(source_type);
