/**
 * CompanyBrain AI — Local-only backend
 * - SQLite (better-sqlite3) for DB
 * - JWT + bcrypt for auth
 * - Local filesystem for storage
 * - Gemini API as the only external dependency
 *
 * 起動: `npm run server:dev` (file watch) または `npm run server:start`
 */
import './load-env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

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

// Production: serve the built frontend bundle from ./dist if present.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const distExists = fs.existsSync(path.join(DIST_DIR, 'index.html'));
const indexHtml = distExists ? fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8') : null;

if (distExists) {
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next();
    return serveStatic({ root: './dist' })(c, next);
  });
}

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ errorType: 'not_found', message: 'API endpoint not found', error: 'API endpoint not found' }, 404);
  }
  if (indexHtml) return c.html(indexHtml);
  return c.text('Not Found', 404);
});

app.onError((err, c) => {
  console.error('[server] Unhandled error:', err);
  return c.json({ errorType: 'unhandled_error', message: err.message, error: err.message }, 500);
});

const port = Number(process.env.SERVER_PORT || 3001);
const host = process.env.SERVER_HOST || '0.0.0.0';
serve({ fetch: app.fetch, port, hostname: host });
console.log(`[server] CompanyBrain AI Hono API listening on http://${host}:${port}`);
if (distExists) {
  console.log(`[server] Serving frontend from ${DIST_DIR}`);
} else {
  console.log('[server] No dist/ directory — frontend will not be served. Run `npm run build` for production.');
}
