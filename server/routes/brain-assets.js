import { Hono } from 'hono';
import crypto from 'node:crypto';
import { requireAuth, jsonError } from '../lib/auth-middleware.js';
import { db } from '../lib/db.js';
import { assertTenantAccess } from '../lib/context.js';
import { saveFile } from '../lib/storage.js';
import { signFileToken } from '../lib/auth.js';

const router = new Hono();
router.use('*', requireAuth);

// GET /api/brain-assets?brainPersonId=
router.get('/', (c) => {
  const ctx = c.get('ctx');
  const brainPersonId = c.req.query('brainPersonId');
  if (!brainPersonId) return jsonError(c, 400, 'invalid_request', 'brainPersonId が必要です。');

  const person = db.prepare('SELECT client_company_id FROM brain_persons WHERE id = ?').get(brainPersonId);
  if (!person) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, person.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const rows = db.prepare('SELECT * FROM brain_source_assets WHERE brain_person_id = ? ORDER BY uploaded_at DESC')
    .all(brainPersonId);
  return c.json(rows);
});

// POST /api/brain-assets — multipart upload
router.post('/', async (c) => {
  const ctx = c.get('ctx');
  const form = await c.req.parseBody();
  const brainPersonId = form.brainPersonId;
  const assetType = form.assetType;
  const file = form.file;

  if (!brainPersonId || !assetType || !file) {
    return jsonError(c, 400, 'invalid_request', 'brainPersonId, assetType, file が必要です。');
  }
  if (!['video','audio','consent_document'].includes(assetType)) {
    return jsonError(c, 400, 'invalid_request', 'assetType が不正です。');
  }
  if (typeof file === 'string') {
    return jsonError(c, 400, 'invalid_request', 'file は File 形式で送信してください。');
  }

  const person = db.prepare('SELECT client_company_id FROM brain_persons WHERE id = ?').get(brainPersonId);
  if (!person) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, person.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  // ファイル保存
  const arrayBuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const storagePath = await saveFile({
    companyId: person.client_company_id,
    brainPersonId,
    assetType,
    originalName: file.name || 'upload',
    mimeType: file.type || 'application/octet-stream',
    buffer,
  });

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO brain_source_assets
      (id, client_company_id, brain_person_id, asset_type, storage_path,
       original_file_name, size_bytes, mime_type, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, person.client_company_id, brainPersonId, assetType, storagePath,
    file.name || null, file.size || null, file.type || null, ctx.id
  );
  const row = db.prepare('SELECT * FROM brain_source_assets WHERE id = ?').get(id);
  return c.json(row, 201);
});

// GET /api/brain-assets/:id/signed-url
router.get('/:id/signed-url', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const asset = db.prepare('SELECT * FROM brain_source_assets WHERE id = ?').get(id);
  if (!asset) return jsonError(c, 404, 'not_found', 'アセットが見つかりません。');
  const t = assertTenantAccess(ctx, asset.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const token = await signFileToken({ assetId: asset.id, userId: ctx.id });
  return c.json({
    signedUrl: `/api/files/${token}`,
    expiresIn: 3600,
  });
});

export default router;
