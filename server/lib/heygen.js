/**
 * HeyGen API クライアント（サーバーサイド専用）
 * - Interactive (Live) Avatar Streaming API
 * - 環境変数 HEYGEN_API_KEY を使用
 */

const HEYGEN_BASE = 'https://api.heygen.com';

function apiKey() {
  return process.env.HEYGEN_API_KEY || '';
}

export function isConfigured() {
  return !!apiKey();
}

/**
 * Interactive Avatar セッショントークンを発行
 * フロントエンドはこのトークンと @heygen/streaming-avatar SDK で接続する
 * トークンは短命 (~15min)
 */
export async function createStreamingToken() {
  if (!isConfigured()) throw new Error('HEYGEN_API_KEY is not configured.');
  const res = await fetch(`${HEYGEN_BASE}/v1/streaming.create_token`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey(),
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`HeyGen create_token failed ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data?.data?.token;
  if (!token) throw new Error(`HeyGen create_token: token missing in response: ${JSON.stringify(data).slice(0, 200)}`);
  return token;
}

/**
 * Interactive Avatar 一覧を取得（人物選択 UI 用、任意）
 */
export async function listInteractiveAvatars() {
  if (!isConfigured()) throw new Error('HEYGEN_API_KEY is not configured.');
  const res = await fetch(`${HEYGEN_BASE}/v1/streaming/avatar.list`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey() },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`HeyGen avatar.list failed ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.data || [];
}

/**
 * Voice 一覧
 */
export async function listVoices() {
  if (!isConfigured()) throw new Error('HEYGEN_API_KEY is not configured.');
  const res = await fetch(`${HEYGEN_BASE}/v2/voices`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey() },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`HeyGen voices.list failed ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.data?.voices || data?.data || [];
}
