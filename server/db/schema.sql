-- CompanyBrain AI - Local SQLite Schema
-- このスキーマはサーバー起動時に自動適用されます (server/lib/db.js)

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- =========================================================
-- users (認証用) - 自前で持つ
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,                  -- UUID v4
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,                     -- bcrypt
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================================================
-- client_companies
-- =========================================================
CREATE TABLE IF NOT EXISTS client_companies (
  id              TEXT PRIMARY KEY,
  company_name    TEXT NOT NULL,
  plan_name       TEXT NOT NULL DEFAULT 'Professional'
                  CHECK (plan_name IN ('Light','Standard','Professional','Enterprise')),
  mission         TEXT,
  vision          TEXT,
  values_note     TEXT,
  main_services   TEXT,
  brand_tone      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================================================
-- user_profiles
-- =========================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  client_company_id  TEXT REFERENCES client_companies(id) ON DELETE SET NULL,
  business_role      TEXT NOT NULL DEFAULT 'viewer'
                     CHECK (business_role IN ('softdoing_admin','client_admin','executive','editor','employee','viewer')),
  display_name       TEXT,
  department         TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================================================
-- brain_persons
-- =========================================================
CREATE TABLE IF NOT EXISTS brain_persons (
  id                   TEXT PRIMARY KEY,
  client_company_id    TEXT NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  full_name            TEXT NOT NULL,
  role_title           TEXT,
  department           TEXT,
  expertise_domain     TEXT,
  strength_fields      TEXT NOT NULL DEFAULT '[]',  -- JSON array as string
  speaking_style       TEXT,
  values_note          TEXT,
  internal_use_allowed INTEGER NOT NULL DEFAULT 1,  -- BOOLEAN: 0/1
  external_use_allowed INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','active','archived')),
  notes                TEXT,
  created_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brain_persons_company ON brain_persons(client_company_id);

-- =========================================================
-- brain_source_assets
-- =========================================================
CREATE TABLE IF NOT EXISTS brain_source_assets (
  id                  TEXT PRIMARY KEY,
  client_company_id   TEXT NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  brain_person_id     TEXT NOT NULL REFERENCES brain_persons(id) ON DELETE CASCADE,
  asset_type          TEXT NOT NULL CHECK (asset_type IN ('video','audio','consent_document')),
  storage_path        TEXT NOT NULL,                 -- uploads/ からの相対パス
  original_file_name  TEXT,
  size_bytes          INTEGER,
  duration_seconds    REAL,
  mime_type           TEXT,
  uploaded_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at         TEXT NOT NULL DEFAULT (datetime('now')),
  notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_brain_assets_person ON brain_source_assets(brain_person_id);

-- =========================================================
-- brain_consent_records
-- =========================================================
CREATE TABLE IF NOT EXISTS brain_consent_records (
  id                   TEXT PRIMARY KEY,
  client_company_id    TEXT NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  brain_person_id      TEXT NOT NULL REFERENCES brain_persons(id) ON DELETE CASCADE,
  consent_status       TEXT NOT NULL DEFAULT 'pending'
                       CHECK (consent_status IN ('pending','approved','revoked')),
  consent_scope        TEXT NOT NULL DEFAULT 'internal_only'
                       CHECK (consent_scope IN ('internal_only','external_only','internal_and_external')),
  purpose_note         TEXT,
  allowed_use_cases    TEXT NOT NULL DEFAULT '[]',
  forbidden_use_cases  TEXT NOT NULL DEFAULT '[]',
  consent_expires_at   TEXT,
  consent_storage_path TEXT,
  revocation_reason    TEXT,
  acted_by             TEXT REFERENCES users(id) ON DELETE SET NULL,
  acted_by_role        TEXT,
  previous_status      TEXT,
  new_status           TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brain_consents_person ON brain_consent_records(brain_person_id);

-- =========================================================
-- brain_interview_sessions
-- =========================================================
CREATE TABLE IF NOT EXISTS brain_interview_sessions (
  id                   TEXT PRIMARY KEY,
  client_company_id    TEXT NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  brain_person_id      TEXT NOT NULL REFERENCES brain_persons(id) ON DELETE CASCADE,
  use_case_type        TEXT,
  mode                 TEXT NOT NULL DEFAULT 'text_chat'
                       CHECK (mode IN ('text_chat','live_avatar')),
  status               TEXT NOT NULL DEFAULT 'in_progress'
                       CHECK (status IN ('in_progress','completed','abandoned')),
  title                TEXT,
  started_at           TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at         TEXT,
  turn_count           INTEGER NOT NULL DEFAULT 0,
  transcript           TEXT NOT NULL DEFAULT '[]',     -- JSON array
  extracted_at         TEXT,
  extraction_status    TEXT NOT NULL DEFAULT 'pending'
                       CHECK (extraction_status IN ('pending','completed','failed')),
  extraction_error     TEXT,
  interviewer_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_brain_sessions_person ON brain_interview_sessions(brain_person_id);

-- =========================================================
-- brain_policy_candidates
-- =========================================================
CREATE TABLE IF NOT EXISTS brain_policy_candidates (
  id                          TEXT PRIMARY KEY,
  client_company_id           TEXT NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  brain_person_id             TEXT NOT NULL REFERENCES brain_persons(id) ON DELETE CASCADE,
  brain_interview_session_id  TEXT NOT NULL REFERENCES brain_interview_sessions(id) ON DELETE CASCADE,
  category                    TEXT NOT NULL CHECK (category IN (
    'decisionPolicy','educationPolicy','salesPolicy','customerSupportPolicy',
    'escalationRules','forbiddenActions','trainingFAQ','workReviewCriteria','decisionExamples'
  )),
  title                       TEXT,
  draft_text                  TEXT NOT NULL,
  source_turn_indexes         TEXT NOT NULL DEFAULT '[]',  -- JSON array of numbers
  suggested_audience_scope    TEXT NOT NULL DEFAULT 'internal'
                              CHECK (suggested_audience_scope IN ('public','internal','executive','admin_only')),
  suggested_tags              TEXT NOT NULL DEFAULT '[]',
  status                      TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','approved','rejected')),
  reviewer_note               TEXT,
  reviewed_by                 TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at                 TEXT,
  approved_knowledge_chunk_id TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brain_candidates_person ON brain_policy_candidates(brain_person_id);
CREATE INDEX IF NOT EXISTS idx_brain_candidates_status ON brain_policy_candidates(status);

-- =========================================================
-- knowledge_chunks
-- =========================================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                  TEXT PRIMARY KEY,
  client_company_id   TEXT NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  source_kind         TEXT NOT NULL DEFAULT 'brain_interview',
  source_ref_id       TEXT,
  title               TEXT NOT NULL,
  chunk_text          TEXT NOT NULL,
  category            TEXT,
  audience_scope      TEXT NOT NULL DEFAULT 'internal'
                      CHECK (audience_scope IN ('public','internal','executive','admin_only')),
  tags                TEXT NOT NULL DEFAULT '[]',
  status              TEXT NOT NULL DEFAULT 'approved'
                      CHECK (status IN ('draft','approved','archived')),
  approved_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_company ON knowledge_chunks(client_company_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_scope ON knowledge_chunks(audience_scope);
