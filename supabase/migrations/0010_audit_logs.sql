-- =========================================================
-- Audit log: a server-side record of every Q&A exchange so the
-- organisation retains a durable trail (the in-app transcript lives
-- only in the visitor's browser localStorage). Conversations happen
-- browser <-> Gemini Live directly, so entries are appended by the
-- client as each message finalises.
-- =========================================================

create table if not exists audit_logs (
  id           uuid primary key default uuid_generate_v4(),
  -- Keep logs even if the brain is later deleted (audit trails must
  -- outlive their subject), so SET NULL + a denormalised name copy.
  avatar_id    uuid references avatars(id) on delete set null,
  avatar_name  text,
  -- Groups messages from one browser session/visit together.
  session_id   text,
  -- Weak client identifier (browser-generated) until real auth exists.
  actor        text,
  role         text not null,            -- 'user' | 'agent'
  content      text not null,
  -- For agent messages: the knowledge chunks the answer was grounded
  -- in, and any escalation flag the question tripped.
  sources      jsonb,
  escalation   jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_logs_avatar_idx
  on audit_logs(avatar_id, created_at desc);
create index if not exists audit_logs_created_idx
  on audit_logs(created_at desc);
create index if not exists audit_logs_session_idx
  on audit_logs(session_id);
