/**
 * CompanyBrain AI — Local-only backend
 * - SQLite (better-sqlite3) for DB
 * - JWT + bcrypt for auth
 * - Local filesystem for storage
 * - Gemini API as the only external dependency
 *
 * 起動: `npm run server:dev` (file watch) または `npm run server:start`
 */
import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';

import { migrate } from './lib/db.js';
import authRouter from './routes/auth.js';
import brainPersonsRouter from './routes/brain-persons.js';
import brainAssetsRouter from './routes/brain-assets.js';
import chatRouter from './routes/chat.js';
import brainInterviewsRouter from './routes/brain-interviews.js';
import brainPoliciesRouter from './routes/brain-policies.js';
import filesRouter from './routes/files.js';
import heygenRouter from './routes/heygen.js';

// 起動前にスキーマを適用
migrate();

const app = new Hono();

app.use('*', cors({
  origin: (origin) => origin || '*',
  credentials: true,
}));

app.get('/api/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

app.route('/api/auth', authRouter);
app.route('/api/brain-persons', brainPersonsRouter);
app.route('/api/brain-assets', brainAssetsRouter);
app.route('/api/chat', chatRouter);
app.route('/api/brain-interviews', brainInterviewsRouter);
app.route('/api/brain-policies', brainPoliciesRouter);
app.route('/api/files', filesRouter);
app.route('/api/heygen', heygenRouter);

app.notFound((c) => c.json({ errorType: 'not_found', message: 'API endpoint not found', error: 'API endpoint not found' }, 404));
app.onError((err, c) => {
  console.error('[server] Unhandled error:', err);
  return c.json({ errorType: 'unhandled_error', message: err.message, error: err.message }, 500);
});

const port = Number(process.env.SERVER_PORT || 3001);
serve({ fetch: app.fetch, port });
console.log(`[server] CompanyBrain AI Hono API listening on http://localhost:${port}`);
