-- =========================================================
-- Brain request: 受理 flow + deliver-as-copy.
--
--  - delivered_avatar_id: the COPY handed to the requester. The
--    admin's original brain is preserved untouched; the requester
--    receives an independent duplicate (own avatar row + copied
--    knowledge chunks).
--  - copy_brain(): duplicates an avatar and its knowledge_chunks
--    (incl. pgvector embeddings) in-database, which is far more
--    reliable than round-tripping vectors through the API. The copy
--    is tagged with request_id so it stays plan-exempt and
--    material-locked for the requester.
-- =========================================================

alter table brain_requests
  add column if not exists delivered_avatar_id uuid references avatars(id) on delete set null;

create or replace function copy_brain(
  source_id uuid,
  new_owner text,
  req_id uuid
) returns uuid
language plpgsql
as $$
declare
  new_id uuid;
begin
  insert into avatars (
    name, description, heygen_photo_id, heygen_voice_id,
    cover_image_path, stage_image_path, voice, language, persona_prompt,
    owner_email, request_id
  )
  select
    name, description, heygen_photo_id, heygen_voice_id,
    cover_image_path, stage_image_path, voice, language, persona_prompt,
    new_owner, req_id
  from avatars
  where id = source_id
  returning id into new_id;

  insert into knowledge_chunks (avatar_id, content, embedding)
  select new_id, content, embedding
  from knowledge_chunks
  where avatar_id = source_id;

  return new_id;
end;
$$;
