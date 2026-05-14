/**
 * SQLite データベース接続 + マイグレーション
 * - Node 22.5+ 組み込みの node:sqlite を使用（ネイティブビルド不要）
 * - サーバー起動時に schema.sql を流す（IF NOT EXISTS で冪等）
 * - データファイルは process.env.DB_PATH または ./data/companybrain.db
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const dbPath = process.env.DB_PATH || path.join(ROOT, 'data', 'companybrain.db');

// data ディレクトリを作る
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * 既存テーブルに ALTER TABLE で列を追加する（冪等）
 */
function addColumnIfMissing(table, column, definition) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.some((c) => c.name === column)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db] added column ${table}.${column}`);
  } catch (err) {
    // table が存在しない場合は CREATE TABLE で対応するので無視
    if (!/no such table/i.test(err.message)) {
      console.warn(`[db] addColumnIfMissing(${table}.${column}) failed:`, err.message);
    }
  }
}

/**
 * スキーマを適用する（冪等）
 */
export function migrate() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  // ステートメント単位で分割実行
  const statements = sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    try {
      db.exec(stmt);
    } catch (err) {
      console.error('[db] migration failed at statement:', stmt.slice(0, 80), err.message);
      throw err;
    }
  }

  // 既存 DB への後付けマイグレーション
  addColumnIfMissing('brain_persons', 'heygen_avatar_id', 'TEXT');
  addColumnIfMissing('brain_persons', 'heygen_voice_id', 'TEXT');

  console.log(`[db] migrated schema at ${dbPath}`);
}

/**
 * トランザクションヘルパー
 */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * 値のシリアライズ / デシリアライズヘルパー
 */
export function fromJsonArr(text) {
  try { return Array.isArray(JSON.parse(text || '[]')) ? JSON.parse(text || '[]') : []; }
  catch { return []; }
}
export function toJsonArr(arr) {
  return JSON.stringify(Array.isArray(arr) ? arr : []);
}
export function fromBool(v) { return v === 1 || v === true || v === '1'; }
export function toBool(v) { return v ? 1 : 0; }

export function shapeBrainPerson(row) {
  if (!row) return null;
  return {
    ...row,
    strength_fields: fromJsonArr(row.strength_fields),
    internal_use_allowed: fromBool(row.internal_use_allowed),
    external_use_allowed: fromBool(row.external_use_allowed),
  };
}

export function shapeInterview(row) {
  if (!row) return null;
  return { ...row, transcript: fromJsonArr(row.transcript) };
}

export function shapeCandidate(row) {
  if (!row) return null;
  return {
    ...row,
    source_turn_indexes: fromJsonArr(row.source_turn_indexes),
    suggested_tags: fromJsonArr(row.suggested_tags),
  };
}

export function shapeChunk(row) {
  if (!row) return null;
  return { ...row, tags: fromJsonArr(row.tags) };
}
