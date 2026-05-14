import { Hono } from 'hono';
import { requireAuth, jsonError } from '../lib/auth-middleware.js';
import { createStreamingToken, listInteractiveAvatars, listVoices, isConfigured } from '../lib/heygen.js';

const router = new Hono();
router.use('*', requireAuth);

/**
 * POST /api/heygen/session-token
 * フロントの @heygen/streaming-avatar SDK が使うトークンを発行。
 * トークンは短命なので毎回サーバーから取得する。
 */
router.post('/session-token', async (c) => {
  if (!isConfigured()) {
    return jsonError(c, 503, 'heygen_not_configured', 'HEYGEN_API_KEY が設定されていません。');
  }
  try {
    const token = await createStreamingToken();
    return c.json({ token });
  } catch (err) {
    return jsonError(c, 502, 'heygen_error', err.message);
  }
});

/**
 * GET /api/heygen/avatars
 * Interactive Avatar の一覧（カスタム Avatar IV や Public Avatar など）。
 * 設定 UI で選択肢として使う想定。
 */
router.get('/avatars', async (c) => {
  if (!isConfigured()) {
    return jsonError(c, 503, 'heygen_not_configured', 'HEYGEN_API_KEY が設定されていません。');
  }
  try {
    const avatars = await listInteractiveAvatars();
    return c.json({ avatars });
  } catch (err) {
    return jsonError(c, 502, 'heygen_error', err.message);
  }
});

/**
 * GET /api/heygen/voices
 */
router.get('/voices', async (c) => {
  if (!isConfigured()) {
    return jsonError(c, 503, 'heygen_not_configured', 'HEYGEN_API_KEY が設定されていません。');
  }
  try {
    const voices = await listVoices();
    return c.json({ voices });
  } catch (err) {
    return jsonError(c, 502, 'heygen_error', err.message);
  }
});

/**
 * GET /api/heygen/status — フロントが HeyGen 有効か判定するため
 */
router.get('/status', (c) => {
  return c.json({ configured: isConfigured() });
});

export default router;
