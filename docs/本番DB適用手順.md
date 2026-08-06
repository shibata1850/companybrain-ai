# 本番 DB マイグレーション適用手順

対象: Supabase(本番)/ 実行場所: **SQL Editor**
作成: 2026-08 / 対象マイグレーション: **0021・0023(確認)・0027・0028**

---

## 進め方

**STEP 1(確認)→ STEP 2(適用)→ STEP 3(検証)** の順に実行してください。
いきなり STEP 2 を流さず、必ず STEP 1 で現状を確認します。

すべての DDL は `if not exists` を使っているため、**既に適用済みの項目を再実行しても安全**(何も起きません)です。

> **本手順は実際に検証済みです。**
> PostgreSQL 16 に本番と同じ状態(0001〜0026 適用済み、0021・0027・0028 未適用)を再現し、本書の SQL をそのまま実行して以下を確認しました。
> - STEP 1 の確認クエリが未適用項目を正しく検出する
> - STEP 2 のブロック A〜E がすべて成功する
> - STEP 3 でインデックス 9 本すべてが作成される
> - **全ブロックを二度実行しても失敗しない**(冪等)
> - 順序を誤って D の前に E を実行すると、下表のとおりのエラーになり、D を実行後に E を再実行すれば復旧する

---

## STEP 1: 現在の適用状況を確認する

まず以下を実行し、**どのマイグレーションが未適用か**を確認します。データは変更しません。

```sql
-- 各マイグレーションが適用済みか一覧で確認する(読み取りのみ)
select '0021: training_videos.size_bytes' as item,
       to_char(count(*), 'FM9') as found,
       case when count(*) > 0 then '適用済み' else '未適用' end as status
from information_schema.columns
where table_name = 'training_videos' and column_name = 'size_bytes'
union all
select '0021: voice_sessions テーブル', to_char(count(*), 'FM9'),
       case when count(*) > 0 then '適用済み' else '未適用' end
from information_schema.tables
where table_name = 'voice_sessions'
union all
select '0023: training_videos.extracted_rules', to_char(count(*), 'FM9'),
       case when count(*) > 0 then '適用済み' else '未適用' end
from information_schema.columns
where table_name = 'training_videos' and column_name = 'extracted_rules'
union all
select '0024: notifications.media_path', to_char(count(*), 'FM9'),
       case when count(*) > 0 then '適用済み' else '未適用' end
from information_schema.columns
where table_name = 'notifications' and column_name = 'media_path'
union all
select '0025: app_users.questions_reset_at', to_char(count(*), 'FM9'),
       case when count(*) > 0 then '適用済み' else '未適用' end
from information_schema.columns
where table_name = 'app_users' and column_name = 'questions_reset_at'
union all
select '0026: organizations テーブル', to_char(count(*), 'FM9'),
       case when count(*) > 0 then '適用済み' else '未適用' end
from information_schema.tables
where table_name = 'organizations'
union all
select '0027: avatars.shared_with_org', to_char(count(*), 'FM9'),
       case when count(*) > 0 then '適用済み' else '未適用' end
from information_schema.columns
where table_name = 'avatars' and column_name = 'shared_with_org'
union all
select '0027: avatar_shares テーブル', to_char(count(*), 'FM9'),
       case when count(*) > 0 then '適用済み' else '未適用' end
from information_schema.tables
where table_name = 'avatar_shares'
order by item;
```

**結果の見方**

- `0026` が「適用済み」であることを確認してください(エンタープライズ機能の土台)。
- `0023` が **未適用**の場合は、STEP 2 の「0023」ブロックも実行してください(0028 のインデックスがこの列に依存するため)。
- `0024` `0025` が未適用でもアプリは動きますが、お知らせの添付と質問回数リセットが使えないため、あわせて適用することを推奨します。

---

## STEP 2: 適用する

**上から順に**実行してください(0027 → 0028 の順序が必要です。0028 のインデックスが 0027 の列を参照するため)。
Supabase の SQL Editor に貼り付けて実行します。1ブロックずつ実行すると、どこで問題が起きたか分かりやすくなります。

### ブロック A — 0021(プラン制限データ)

素材容量の計上と音声利用分の記録に必要です。

```sql
alter table training_videos
  add column if not exists size_bytes bigint;

create table if not exists voice_sessions (
  id            uuid primary key default uuid_generate_v4(),
  actor         text,
  avatar_id     uuid references avatars(id) on delete set null,
  seconds       integer not null,
  created_at    timestamptz not null default now()
);

create index if not exists voice_sessions_actor_idx
  on voice_sessions(actor, created_at desc);
```

### ブロック B — 0023(素材から抽出した振る舞いルール)

**STEP 1 で「未適用」だった場合のみ実行**してください。適用済みなら飛ばして構いません(再実行しても無害です)。

```sql
alter table training_videos
  add column if not exists extracted_rules text;
```

### ブロック C — 0024・0025(お知らせ添付 / 質問回数リセット)

未適用の場合に実行してください。

```sql
alter table notifications
  add column if not exists media_path text;

alter table notifications
  add column if not exists media_type text;

alter table app_users
  add column if not exists questions_reset_at timestamptz;
```

### ブロック D — 0027(ブレイン共有)

エンタープライズのブレイン共有機能に必要です。

```sql
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
```

### ブロック E — 0028(性能インデックス)

**必ずブロック B と D の後に実行してください。** `shared_with_org`(0027)と `extracted_rules`(0023)の列を参照します。

`CREATE INDEX` は対象テーブルに短時間の書き込みロックを取ります。**利用の少ない時間帯**に実行してください。

```sql
create index if not exists audit_logs_actor_role_created_idx
  on audit_logs(actor, role, created_at desc);

create index if not exists audit_logs_actor_created_idx
  on audit_logs(actor, created_at desc);

create index if not exists avatars_shared_org_idx
  on avatars(shared_with_org)
  where shared_with_org;

create index if not exists avatars_owner_deleted_idx
  on avatars(owner_email, deleted_at desc);

create index if not exists training_videos_avatar_created_idx
  on training_videos(avatar_id, created_at desc);

create index if not exists training_videos_rules_idx
  on training_videos(avatar_id, status)
  where extracted_rules is not null;
```

---

## STEP 3: 適用後の検証

### 3-1. すべて「適用済み」になったか

**STEP 1 の確認クエリをもう一度実行**し、全項目が「適用済み」になっていることを確認します。

### 3-2. インデックスが作成されたか

```sql
select indexname, tablename
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'audit_logs_actor_role_created_idx',
    'audit_logs_actor_created_idx',
    'avatars_shared_org_idx',
    'avatars_owner_deleted_idx',
    'training_videos_avatar_created_idx',
    'training_videos_rules_idx',
    'voice_sessions_actor_idx',
    'avatar_shares_email_idx',
    'avatar_shares_avatar_idx'
  )
order by tablename, indexname;
```

**9行**返れば完了です。

### 3-3. 既存データが壊れていないか

```sql
select
  (select count(*) from avatars)          as ブレイン数,
  (select count(*) from training_videos)  as 素材数,
  (select count(*) from app_users)        as ユーザー数,
  (select count(*) from audit_logs)       as 監査ログ数,
  (select count(*) from avatar_shares)    as 共有設定数;
```

適用前後で **ブレイン数・素材数・ユーザー数・監査ログ数が変わっていないこと**を確認してください(今回の適用は列とテーブルの追加のみで、既存行を変更しません)。`共有設定数` は新規テーブルなので 0 で正常です。

---

## アプリ側での動作確認

適用後、以下が使えるようになります。

| 確認項目 | 手順 | 期待する結果 |
|---|---|---|
| ブレイン共有 | 組織所属アカウントでブレイン詳細 →「社員に共有」 | パネルが表示され、メンバーを選んで保存できる |
| 素材容量の計上 | 文書をアップロード | プラン上限に対して容量が加算される |
| 音声分の計上 | 音声会話を行って終了 | マイページの利用状況に音声分が反映される |
| 質問回数リセット | 管理者 → ユーザー管理 →「質問回数リセット」 | エラーにならず実行できる |

---

## 問題が起きた場合

| 症状 | 原因 | 対処 |
|---|---|---|
| `column "shared_with_org" does not exist` | ブロック D より先に E を実行した | ブロック D を実行してから E を再実行 |
| `column "extracted_rules" does not exist` | 0023 が未適用のまま E を実行した | ブロック B を実行してから E を再実行 |
| `function uuid_generate_v4() does not exist` | uuid-ossp 拡張が無い | `create extension if not exists "uuid-ossp";` を実行してから再実行 |
| インデックス作成が終わらない | 大きなテーブルへのロック待ち | 利用の少ない時間帯に再実行 |

**ロールバックについて**: 今回の適用はすべて「追加」のみで、既存の列・行・テーブルを変更・削除しません。そのため通常はロールバック不要です。仮に取り消す場合も、追加した列やインデックスを個別に `drop` するだけで、既存データには影響しません。
