-- =========================================================
-- Per-avatar voice selection. Each avatar can override the global
-- GEMINI_LIVE_VOICE; NULL = fall back to the env default.
-- =========================================================

alter table avatars
  add column if not exists voice text;
