-- =========================================================
-- Separate "persona behavior" from "human-readable description".
-- description = shown in the UI as a brain summary.
-- persona_prompt = injected verbatim into the Live API system
-- instruction. Lets the operator tune voice / tone / refusal policy
-- without polluting the description shown to viewers.
-- =========================================================

alter table avatars
  add column if not exists persona_prompt text;
