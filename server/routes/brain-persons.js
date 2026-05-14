import { Hono } from 'hono';
import crypto from 'node:crypto';
import { requireAuth, jsonError } from '../lib/auth-middleware.js';
import { db, shapeBrainPerson, toJsonArr, toBool } from '../lib/db.js';
import { assertTenantAccess, isGlobalAdmin } from '../lib/context.js';

const router = new Hono();
router.use('*', requireAuth);

// GET /api/brain-persons
router.get('/', (c) => {
  const ctx = c.get('ctx');
  if (!ctx.clientCompanyId && !isGlobalAdmin(ctx)) return c.json([]);
  let rows;
  if (isGlobalAdmin(ctx)) {
    rows = db.prepare('SELECT * FROM brain_persons ORDER BY created_at DESC').all();
  } else {
    rows = db.prepare('SELECT * FROM brain_persons WHERE client_company_id = ? ORDER BY created_at DESC')
      .all(ctx.clientCompanyId);
  }
  return c.json(rows.map(shapeBrainPerson));
});

// GET /api/brain-persons/:id
router.get('/:id', (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const row = db.prepare('SELECT * FROM brain_persons WHERE id = ?').get(id);
  if (!row) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, row.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);
  return c.json(shapeBrainPerson(row));
});

// POST /api/brain-persons
router.post('/', async (c) => {
  const ctx = c.get('ctx');
  const body = await c.req.json();
  const clientCompanyId = body.client_company_id || ctx.clientCompanyId;
  if (!clientCompanyId) return jsonError(c, 400, 'invalid_request', 'client_company_id が必要です。');
  const t = assertTenantAccess(ctx, clientCompanyId);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const id = crypto.randomUUID();
  const insert = db.prepare(`
    INSERT INTO brain_persons (
      id, client_company_id, full_name, role_title, department, expertise_domain,
      strength_fields, speaking_style, values_note, internal_use_allowed,
      external_use_allowed, status, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    id,
    clientCompanyId,
    body.full_name || 'Untitled Brain',
    body.role_title || null,
    body.department || null,
    body.expertise_domain || null,
    toJsonArr(body.strength_fields),
    body.speaking_style || null,
    body.values_note || null,
    toBool(body.internal_use_allowed !== false),
    toBool(body.external_use_allowed),
    body.status || 'draft',
    body.notes || null,
    ctx.id
  );
  const row = db.prepare('SELECT * FROM brain_persons WHERE id = ?').get(id);
  return c.json(shapeBrainPerson(row), 201);
});

// PATCH /api/brain-persons/:id
router.patch('/:id', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const body = await c.req.json();
  const existing = db.prepare('SELECT * FROM brain_persons WHERE id = ?').get(id);
  if (!existing) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, existing.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const fields = [];
  const values = [];
  const addText = (key, val) => { fields.push(`${key} = ?`); values.push(val); };

  if ('full_name' in body) addText('full_name', body.full_name);
  if ('role_title' in body) addText('role_title', body.role_title);
  if ('department' in body) addText('department', body.department);
  if ('expertise_domain' in body) addText('expertise_domain', body.expertise_domain);
  if ('strength_fields' in body) addText('strength_fields', toJsonArr(body.strength_fields));
  if ('speaking_style' in body) addText('speaking_style', body.speaking_style);
  if ('values_note' in body) addText('values_note', body.values_note);
  if ('internal_use_allowed' in body) addText('internal_use_allowed', toBool(body.internal_use_allowed));
  if ('external_use_allowed' in body) addText('external_use_allowed', toBool(body.external_use_allowed));
  if ('status' in body) addText('status', body.status);
  if ('notes' in body) addText('notes', body.notes);
  fields.push(`updated_at = datetime('now')`);

  if (fields.length === 1) {
    return c.json(shapeBrainPerson(existing));
  }
  values.push(id);
  db.prepare(`UPDATE brain_persons SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare('SELECT * FROM brain_persons WHERE id = ?').get(id);
  return c.json(shapeBrainPerson(row));
});

export default router;
