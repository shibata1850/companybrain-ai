/**
 * 自前 JWT + bcrypt 認証
 * - パスワードは bcryptjs でハッシュ
 * - セッションは JWT (jose) で発行・検証
 * - JWT_SECRET が未設定なら起動時に警告 (ただしランダム生成して動作はする)
 */
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';

const RAW_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET が未設定。ランダムキーを生成しました（再起動でセッション失効）。本番では .env に固定値を入れてください。');
}
const SECRET = new TextEncoder().encode(RAW_SECRET);
const ISSUER = 'companybrain-ai';
const AUDIENCE = 'companybrain-ai-users';
const SESSION_TTL = '30d';
const FILE_TOKEN_TTL = '1h';

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * セッショントークン発行
 */
export async function signSessionToken({ userId, email }) {
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(SECRET);
}

/**
 * セッショントークン検証
 */
export async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER, audience: AUDIENCE });
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

/**
 * ファイル配信用の短期トークン (動画 <video> タグ用)
 */
export async function signFileToken({ assetId, userId }) {
  return new SignJWT({ sub: userId, assetId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience('companybrain-ai-files')
    .setIssuedAt()
    .setExpirationTime(FILE_TOKEN_TTL)
    .sign(SECRET);
}

export async function verifyFileToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER, audience: 'companybrain-ai-files' });
    return { userId: payload.sub, assetId: payload.assetId };
  } catch {
    return null;
  }
}
