-- エンタープライズ向け: ブレインを同じ会社のメンバーと共有する。
--
-- 共有相手は「閲覧・会話のみ」(質問・音声会話は可、素材追加・編集・削除・
-- 声/口調の変更は不可)。共有は必ず同一組織内に限る。個人アカウントの
-- ブレインは従来どおり作成者本人のみ(共有不可)。
--
-- 2つの単位を両方サポート:
--   - shared_with_org = true          … 自社の全メンバーに共有
--   - avatar_shares の行(相手を個別選択)… 選んだメンバーにのみ共有
alter table avatars
  add column if not exists shared_with_org boolean not null default false;

create table if not exists avatar_shares (
  id                uuid primary key default uuid_generate_v4(),
  avatar_id         uuid not null references avatars(id) on delete cascade,
  shared_with_email text not null,
  created_at        timestamptz not null default now(),
  unique (avatar_id, shared_with_email)
);

create index if not exists avatar_shares_email_idx on avatar_shares(shared_with_email);
create index if not exists avatar_shares_avatar_idx on avatar_shares(avatar_id);
