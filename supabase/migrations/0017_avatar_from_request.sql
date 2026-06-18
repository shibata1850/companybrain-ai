-- =========================================================
-- Mark brains that were created via the request workflow and
-- handed over to a requester. Such brains:
--   - are exempt from the owner's plan limits (count + questions)
--   - cannot have new learning material added by the owner
--     (anti-abuse: a gifted unlimited brain must stay as the admin
--      built it)
-- request_id is null for normal, self-made brains.
-- =========================================================

alter table avatars
  add column if not exists request_id uuid references brain_requests(id) on delete set null;

create index if not exists avatars_request_id_idx
  on avatars(request_id) where request_id is not null;
