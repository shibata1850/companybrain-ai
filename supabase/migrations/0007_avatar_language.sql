-- =========================================================
-- Per-avatar spoken language hint. The streaming token sends this as
-- speechConfig.languageCode so the model knows what to listen for.
-- NULL = 'auto' = let the model detect freely (useful when the user
-- code-switches between languages).
-- =========================================================

alter table avatars
  add column if not exists language text;
