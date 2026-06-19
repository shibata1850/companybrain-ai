-- =========================================================
-- Plan enforcement support: material size + voice minute tracking
--
--   training_videos.size_bytes : bytes of each uploaded training file
--     (used to enforce the per-plan materialMb cap).
--   voice_sessions            : one row per live conversation, with
--     elapsed seconds reported by the client when the session ends.
--     Summed against the per-plan monthlyVoiceMinutes cap.
-- =========================================================

alter table training_videos
  add column if not exists size_bytes bigint;

create table if not exists voice_sessions (
  id            uuid primary key default uuid_generate_v4(),
  actor         text,                 -- the user's email
  avatar_id     uuid references avatars(id) on delete set null,
  seconds       integer not null,
  created_at    timestamptz not null default now()
);

create index if not exists voice_sessions_actor_idx
  on voice_sessions(actor, created_at desc);
