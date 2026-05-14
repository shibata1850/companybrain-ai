import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db, tx } from '../lib/db.js';
import { hashPassword, verifyPassword, signSessionToken } from '../lib/auth.js';
import { requireAuth, jsonError } from '../lib/auth-middleware.js';

const auth = new Hono();

/**
 * POST /api/auth/register
 * body: { email, password, displayName? }
 * 最初の登録者は softdoing_admin + デフォルト会社の作成。
 * 2人目以降は既存のデフォルト会社に employee として加入。
 */
auth.post('/register', async (c) => {
  const { email, password, displayName } = await c.req.json();
  if (!email || !password || password.length < 6) {
    return jsonError(c, 400, 'invalid_request', 'email と 6 文字以上のパスワードが必要です。');
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return jsonError(c, 409, 'email_taken', 'このメールアドレスは既に登録されています。');
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  let result;
  try {
    result = tx(() => {
      db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(userId, email, passwordHash);

      // デフォルト会社が存在するか確認、無ければ作る
      let company = db.prepare('SELECT id FROM client_companies ORDER BY created_at ASC LIMIT 1').get();
      let isFirst = false;
      if (!company) {
        const companyId = crypto.randomUUID();
        db.prepare('INSERT INTO client_companies (id, company_name, plan_name) VALUES (?, ?, ?)')
          .run(companyId, 'デフォルト株式会社', 'Professional');
        company = { id: companyId };
        isFirst = true;
      }
      // ユーザープロファイル: 最初の登録者は softdoing_admin、それ以外は employee
      const isFirstUser = db.prepare('SELECT COUNT(*) as cnt FROM user_profiles').get().cnt === 0;
      const role = isFirstUser ? 'softdoing_admin' : 'employee';
      db.prepare(
        'INSERT INTO user_profiles (user_id, client_company_id, business_role, display_name) VALUES (?, ?, ?, ?)'
      ).run(userId, company.id, role, displayName || email.split('@')[0]);

      return { userId, companyId: company.id, role, isFirst };
    });
  } catch (err) {
    return jsonError(c, 500, 'db_error', err.message);
  }

  const accessToken = await signSessionToken({ userId: result.userId, email });
  return c.json({
    accessToken,
    user: {
      id: result.userId,
      email,
      clientCompanyId: result.companyId,
      businessRole: result.role,
    },
  });
});

/**
 * POST /api/auth/login
 * body: { email, password }
 */
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) {
    return jsonError(c, 400, 'invalid_request', 'email と password が必要です。');
  }
  const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email);
  if (!user) {
    return jsonError(c, 401, 'invalid_credentials', 'メールアドレスまたはパスワードが違います。');
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return jsonError(c, 401, 'invalid_credentials', 'メールアドレスまたはパスワードが違います。');
  }
  const accessToken = await signSessionToken({ userId: user.id, email: user.email });

  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(user.id);
  return c.json({
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      clientCompanyId: profile?.client_company_id || null,
      businessRole: profile?.business_role || 'viewer',
      displayName: profile?.display_name || null,
      department: profile?.department || null,
    },
  });
});

/**
 * GET /api/auth/me
 */
auth.get('/me', requireAuth, (c) => {
  const ctx = c.get('ctx');
  return c.json({
    id: ctx.id,
    email: ctx.email,
    clientCompanyId: ctx.clientCompanyId,
    businessRole: ctx.businessRole,
    displayName: ctx.displayName,
    department: ctx.department,
  });
});

export default auth;
