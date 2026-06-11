-- =========================================================
-- External ingestion: allow automated pipelines (Make.com etc.) to
-- upsert training material idempotently. external_ref is a stable
-- identifier supplied by the pipeline (e.g. "egov:325AC0000000201:第48条")
-- so re-running the scenario replaces the entry instead of duplicating it.
-- =========================================================

alter table training_videos
  add column if not exists external_ref text;

create index if not exists training_videos_external_ref_idx
  on training_videos(avatar_id, external_ref);
