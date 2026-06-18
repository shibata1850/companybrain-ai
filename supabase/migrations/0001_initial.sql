-- =========================================================
-- CompanyBrain AI — Initial schema
-- Apply via Supabase SQL editor or `supabase db push`.
-- =========================================================

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- One "brain" / persona per uploaded person.
create table if not exists avatars (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  description     text,
  -- HeyGen handles
  heygen_photo_id text,            -- talking_photo_id
  heygen_voice_id text,            -- cloned voice id
  -- Source assets (paths in the storage bucket)
  cover_image_path text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Each uploaded training video.
create table if not exists training_videos (
  id              uuid primary key default uuid_generate_v4(),
  avatar_id       uuid not null references avatars(id) on delete cascade,
  storage_path    text not null,            -- path in supabase storage bucket
  file_name       text,
  mime_type       text,
  duration_seconds numeric,
  transcript      text,                     -- full transcript from Gemini
  summary         text,                     -- short summary of content
  status          text not null default 'pending', -- pending | processing | ready | error
  error_message   text,
  created_at      timestamptz not null default now()
);

-- Chunked knowledge for retrieval-augmented generation.
create table if not exists knowledge_chunks (
  id              uuid primary key default uuid_generate_v4(),
  avatar_id       uuid not null references avatars(id) on delete cascade,
  video_id        uuid references training_videos(id) on delete cascade,
  content         text not null,
  -- text-embedding-004 returns 768-dim vectors
  embedding       vector(768),
  created_at      timestamptz not null default now()
);

create index if not exists knowledge_chunks_avatar_idx
  on knowledge_chunks(avatar_id);

-- Approximate-nearest-neighbour search index.
create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- One row per question asked.
create table if not exists generations (
  id                uuid primary key default uuid_generate_v4(),
  avatar_id         uuid not null references avatars(id) on delete cascade,
  question          text not null,
  answer            text,                      -- Gemini answer text
  heygen_video_id   text,                      -- video_id returned by HeyGen
  video_url         text,                      -- final mp4 URL (HeyGen or our bucket)
  thumbnail_url     text,
  status            text not null default 'pending',
    -- pending | answering | rendering | ready | error
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists generations_avatar_idx on generations(avatar_id);
create index if not exists generations_status_idx on generations(status);

-- RPC: cosine similarity search over knowledge chunks for one avatar.
create or replace function match_knowledge_chunks (
  query_embedding vector(768),
  target_avatar_id uuid,
  match_count int default 6
)
returns table (
  id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    k.id,
    k.content,
    1 - (k.embedding <=> query_embedding) as similarity
  from knowledge_chunks k
  where k.avatar_id = target_avatar_id
    and k.embedding is not null
  order by k.embedding <=> query_embedding
  limit match_count;
$$;
