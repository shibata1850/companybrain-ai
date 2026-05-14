-- CompanyBrain AI — Brain Studio core schema (Phase 1: Claude Code stack)
-- このファイルを Supabase の SQL Editor で実行してください。
-- 何度実行しても安全（IF NOT EXISTS / CREATE OR REPLACE 多用）。

-- =========================================================
-- 拡張機能
-- =========================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================
-- client_companies — 企業マスター
-- =========================================================
CREATE TABLE IF NOT EXISTS client_companies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name    TEXT NOT NULL,
  plan_name       TEXT NOT NULL DEFAULT 'Light' CHECK (plan_name IN ('Light','Standard','Professional','Enterprise')),
  mission         TEXT,
  vision          TEXT,
  values_note     TEXT,
  main_services   TEXT,
  brand_tone      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- user_profiles — Supabase auth.users と 1:1 紐付け
-- =========================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_company_id  UUID REFERENCES client_companies(id) ON DELETE SET NULL,
  business_role      TEXT NOT NULL DEFAULT 'viewer' CHECK (business_role IN (
    'softdoing_admin','client_admin','executive','editor','employee','viewer'
  )),
  display_name       TEXT,
  department         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- brain_persons — 会社の脳みそとなる人物
-- =========================================================
CREATE TABLE IF NOT EXISTS brain_persons (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_company_id    UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  full_name            TEXT NOT NULL,
  role_title           TEXT,
  department           TEXT,
  expertise_domain     TEXT,
  strength_fields      TEXT[] NOT NULL DEFAULT '{}',
  speaking_style       TEXT,
  values_note          TEXT,
  internal_use_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  external_use_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  notes                TEXT,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brain_persons_company ON brain_persons(client_company_id);

-- =========================================================
-- brain_source_assets — 動画 / 音声 / 同意書
-- =========================================================
CREATE TABLE IF NOT EXISTS brain_source_assets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_company_id   UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  brain_person_id     UUID NOT NULL REFERENCES brain_persons(id) ON DELETE CASCADE,
  asset_type          TEXT NOT NULL CHECK (asset_type IN ('video','audio','consent_document')),
  storage_path        TEXT NOT NULL,            -- Supabase Storage 内のパス
  original_file_name  TEXT,
  size_bytes          BIGINT,
  duration_seconds    NUMERIC,
  mime_type           TEXT,
  uploaded_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_brain_assets_person ON brain_source_assets(brain_person_id);
CREATE INDEX IF NOT EXISTS idx_brain_assets_company ON brain_source_assets(client_company_id);

-- =========================================================
-- brain_consent_records — 同意の履歴・撤回・承認
-- =========================================================
CREATE TABLE IF NOT EXISTS brain_consent_records (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_company_id    UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  brain_person_id      UUID NOT NULL REFERENCES brain_persons(id) ON DELETE CASCADE,
  consent_status       TEXT NOT NULL DEFAULT 'pending' CHECK (consent_status IN ('pending','approved','revoked')),
  consent_scope        TEXT NOT NULL DEFAULT 'internal_only' CHECK (consent_scope IN ('internal_only','external_only','internal_and_external')),
  purpose_note         TEXT,
  allowed_use_cases    TEXT[] NOT NULL DEFAULT '{}',
  forbidden_use_cases  TEXT[] NOT NULL DEFAULT '{}',
  consent_expires_at   DATE,
  consent_storage_path TEXT,
  revocation_reason    TEXT,
  acted_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_by_role        TEXT CHECK (acted_by_role IN ('client_admin','softdoing_admin')),
  previous_status      TEXT,
  new_status           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brain_consents_person ON brain_consent_records(brain_person_id);

-- =========================================================
-- brain_interview_sessions — Brain Interview セッション
-- =========================================================
CREATE TABLE IF NOT EXISTS brain_interview_sessions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_company_id    UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  brain_person_id      UUID NOT NULL REFERENCES brain_persons(id) ON DELETE CASCADE,
  use_case_type        TEXT,
  mode                 TEXT NOT NULL DEFAULT 'text_chat' CHECK (mode IN ('text_chat','live_avatar')),
  status               TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
  title                TEXT,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  turn_count           INT NOT NULL DEFAULT 0,
  transcript           JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_at         TIMESTAMPTZ,
  extraction_status    TEXT NOT NULL DEFAULT 'pending' CHECK (extraction_status IN ('pending','completed','failed')),
  extraction_error     TEXT,
  interviewer_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_brain_sessions_person ON brain_interview_sessions(brain_person_id);

-- =========================================================
-- brain_policy_candidates — Gemini が抽出した方針候補
-- =========================================================
CREATE TABLE IF NOT EXISTS brain_policy_candidates (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_company_id           UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  brain_person_id             UUID NOT NULL REFERENCES brain_persons(id) ON DELETE CASCADE,
  brain_interview_session_id  UUID NOT NULL REFERENCES brain_interview_sessions(id) ON DELETE CASCADE,
  category                    TEXT NOT NULL CHECK (category IN (
    'decisionPolicy','educationPolicy','salesPolicy','customerSupportPolicy',
    'escalationRules','forbiddenActions','trainingFAQ','workReviewCriteria','decisionExamples'
  )),
  title                       TEXT,
  draft_text                  TEXT NOT NULL,
  source_turn_indexes         INT[] NOT NULL DEFAULT '{}',
  suggested_audience_scope    TEXT NOT NULL DEFAULT 'internal' CHECK (suggested_audience_scope IN ('public','internal','executive','admin_only')),
  suggested_tags              TEXT[] NOT NULL DEFAULT '{}',
  status                      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  reviewer_note               TEXT,
  reviewed_by                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at                 TIMESTAMPTZ,
  approved_knowledge_chunk_id UUID,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brain_candidates_person ON brain_policy_candidates(brain_person_id);
CREATE INDEX IF NOT EXISTS idx_brain_candidates_status ON brain_policy_candidates(status);

-- =========================================================
-- knowledge_chunks — 承認済み正式ナレッジ
-- =========================================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_company_id   UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  source_kind         TEXT NOT NULL DEFAULT 'brain_interview',  -- 'brain_interview' | 'manual_upload' など
  source_ref_id       UUID,                                      -- brain_policy_candidates.id 等
  title               TEXT NOT NULL,
  chunk_text          TEXT NOT NULL,
  category            TEXT,
  audience_scope      TEXT NOT NULL DEFAULT 'internal' CHECK (audience_scope IN ('public','internal','executive','admin_only')),
  tags                TEXT[] NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('draft','approved','archived')),
  approved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_company ON knowledge_chunks(client_company_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_scope ON knowledge_chunks(audience_scope);

-- =========================================================
-- 更新時の updated_at 自動更新 (簡易版)
-- =========================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_companies_updated ON client_companies;
CREATE TRIGGER trg_client_companies_updated BEFORE UPDATE ON client_companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_profiles_updated ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_brain_persons_updated ON brain_persons;
CREATE TRIGGER trg_brain_persons_updated BEFORE UPDATE ON brain_persons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- RLS (Row Level Security)
-- バックエンドは service_role キーで全アクセス、フロントは anon キーでアクセス不可。
-- フロントが直接 supabase-js を使う場合はここで policy を書く必要があるが、
-- 本プロジェクトでは Hono API を経由するため RLS は有効化のみして
-- 全テーブルにポリシー無しで「service_role 以外は何もできない」状態にする。
-- =========================================================
ALTER TABLE client_companies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_persons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_source_assets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_policy_candidates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks      ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- Storage バケット作成（クライアント側で直接書き込まない方針）
-- 注: バケットの作成は Dashboard の Storage 画面で行ってください。
-- バケット名: brain-source-assets
-- Public: false (Private)
-- =========================================================
