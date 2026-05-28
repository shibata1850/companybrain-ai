alter table avatars
  add column if not exists deleted_at timestamptz;

create index if not exists avatars_deleted_at_idx on avatars(deleted_at);
