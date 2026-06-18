-- =========================================================
-- Brain creation requests + in-app notifications.
--
-- Flow: user submits a request → admin sees it, marks 対応中, creates
-- a brain in their own account, attaches it to the request, then
-- presses 「このユーザーに譲渡」 which (a) moves owner_email to the
-- requester, (b) marks the request 完了, (c) fires a notification.
-- =========================================================

create table if not exists brain_requests (
  id              uuid primary key default uuid_generate_v4(),
  requester_email text not null,
  -- Editable parts of the request (what the user is asking for).
  title           text not null,                -- 希望するブレイン名
  purpose         text not null,                -- 用途・想定質問
  persona         text,                         -- 希望のペルソナ・口調
  materials       text,                         -- 学習させてほしい素材(任意)
  notes           text,                         -- 補足(任意)
  -- Workflow state.
  status          text not null default '申請中',  -- 申請中 / 対応中 / 完了 / 却下
  assignee_email  text,                         -- 担当の管理者
  result_avatar_id uuid references avatars(id) on delete set null,
  reject_reason   text,
  -- Audit.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists brain_requests_requester_idx
  on brain_requests(requester_email, created_at desc);
create index if not exists brain_requests_status_idx
  on brain_requests(status, created_at desc);

create table if not exists notifications (
  id              uuid primary key default uuid_generate_v4(),
  recipient_email text not null,
  kind            text not null,                -- 'request_completed' | 'request_rejected' | ...
  title           text not null,
  body            text,
  link            text,                         -- where the row should navigate the user
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on notifications(recipient_email, created_at desc);
create index if not exists notifications_unread_idx
  on notifications(recipient_email) where read_at is null;
