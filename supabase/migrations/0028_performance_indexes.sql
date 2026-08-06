-- =========================================================
-- 性能: 実際に使われている WHERE / ORDER BY の組み合わせに対して
-- 欠けていたインデックスを追加する(システムテストでの調査結果)。
--
-- いずれも既存データを変更しない。CREATE INDEX は対象テーブルに
-- 短時間の書き込みロックを取るため、利用の少ない時間帯に適用すること。
-- =========================================================

-- 月間質問数の集計: actor(質問した本人)+ role + created_at で数える。
-- 会話1問につき1行増えるテーブルで、質問のたびに実行される。
-- 既存の索引は avatar_id / created_at / session_id のみで actor が無い。
--   参照: src/lib/planEnforce.ts(getPlanUsage)
create index if not exists audit_logs_actor_role_created_idx
  on audit_logs(actor, role, created_at desc);

-- 監査ログのドリルダウン(管理者が対象ユーザーの会話を追う)。
--   参照: src/app/api/audit/route.ts
create index if not exists audit_logs_actor_created_idx
  on audit_logs(actor, created_at desc);

-- 全社共有ブレインの引き当て。部分索引にして共有中のものだけを持つ。
--   参照: src/app/api/avatars/route.ts(listSharedBrains)
create index if not exists avatars_shared_org_idx
  on avatars(shared_with_org)
  where shared_with_org;

-- ゴミ箱一覧: 所有者 + 削除日時の降順。
--   参照: src/app/api/trash/route.ts
create index if not exists avatars_owner_deleted_idx
  on avatars(owner_email, deleted_at desc);

-- 素材一覧のソート(ブレイン詳細・学習素材管理・重複検出)。
--   参照: src/app/api/avatars/[id]/route.ts, dedupe/route.ts
create index if not exists training_videos_avatar_created_idx
  on training_videos(avatar_id, created_at desc);

-- 振る舞いルールの収集。会話開始のたび・質問のたびに実行される。
--   参照: src/lib/materialRules.ts(collectMaterialRules)
create index if not exists training_videos_rules_idx
  on training_videos(avatar_id, status)
  where extracted_rules is not null;
