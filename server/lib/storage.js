/**
 * ローカルファイルストレージ
 * - uploads/ 配下に保存
 * - 配信時は短期 JWT 付き URL で行う (server/routes/files.js)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');

export function ensureUploadDir(subdir = '') {
  const dir = path.join(UPLOAD_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * ファイルを保存する
 * @returns {string} uploads/ からの相対パス (DB に保存)
 */
export async function saveFile({ companyId, brainPersonId, assetType, originalName, mimeType, buffer }) {
  const ts = Date.now();
  const safe = (originalName || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
  const rel = path.posix.join(companyId, brainPersonId, assetType, `${ts}_${safe}`);
  const abs = path.join(UPLOAD_ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  return rel;
}

/**
 * 相対パスから絶対パスを取得（パストラバーサル対策）
 */
export function resolveStoragePath(relativePath) {
  const abs = path.resolve(UPLOAD_ROOT, relativePath);
  if (!abs.startsWith(UPLOAD_ROOT + path.sep) && abs !== UPLOAD_ROOT) {
    return null;
  }
  return abs;
}

/**
 * ファイルが存在するか
 */
export function fileExists(absPath) {
  return absPath && fs.existsSync(absPath) && fs.statSync(absPath).isFile();
}

/**
 * ファイル削除
 */
export function deleteFile(relativePath) {
  const abs = resolveStoragePath(relativePath);
  if (abs && fileExists(abs)) {
    fs.unlinkSync(abs);
    return true;
  }
  return false;
}
