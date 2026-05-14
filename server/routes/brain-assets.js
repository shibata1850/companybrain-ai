import { Hono } from 'hono';
import { requireAuth, jsonError } from '../lib/auth-middleware.js';
import { supabaseAdmin, assertTenantAccess, isGlobalAdmin } from '../lib/supabase.js';

const router = new Hono();
router.use('*', requireAuth);

const BUCKET = 'brain-source-assets';

// GET /api/brain-assets?brainPersonId=xxx
router.get('/', async (c) => {
  const ctx = c.get('ctx');
  const brainPersonId = c.req.query('brainPersonId');
  if (!brainPersonId) return jsonError(c, 400, 'invalid_request', 'brainPersonId は必須です。');

  // BrainPerson の tenant チェック
  const { data: person, error: fetchErr } = await supabaseAdmin
    .from('brain_persons').select('client_company_id').eq('id', brainPersonId).maybeSingle();
  if (fetchErr) return jsonError(c, 500, 'db_error', fetchErr.message);
  if (!person) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, person.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const { data, error } = await supabaseAdmin
    .from('brain_source_assets').select('*')
    .eq('brain_person_id', brainPersonId)
    .order('uploaded_at', { ascending: false });
  if (error) return jsonError(c, 500, 'db_error', error.message);
  return c.json(data || []);
});

// POST /api/brain-assets — multipart/form-data でファイル受信 → Supabase Storage に保存 → DB に行を追加
// fields: brainPersonId (required), assetType (required), file (required)
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

  // tenant check
  const { data: person, error: fetchErr } = await supabaseAdmin
    .from('brain_persons').select('client_company_id').eq('id', brainPersonId).maybeSingle();
  if (fetchErr) return jsonError(c, 500, 'db_error', fetchErr.message);
  if (!person) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, person.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  // upload to Supabase Storage
  const buf = await file.arrayBuffer();
  const ts = Date.now();
  const safeName = (file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${person.client_company_id}/${brainPersonId}/${assetType}/${ts}_${safeName}`;
  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) return jsonError(c, 500, 'storage_error', upErr.message);

  // DB insert
  const { data, error } = await supabaseAdmin.from('brain_source_assets').insert({
    client_company_id: person.client_company_id,
    brain_person_id: brainPersonId,
    asset_type: assetType,
    storage_path: storagePath,
    original_file_name: file.name || null,
    size_bytes: file.size || null,
    mime_type: file.type || null,
    uploaded_by: ctx.id,
  }).select().single();
  if (error) return jsonError(c, 500, 'db_error', error.message);

  return c.json(data, 201);
});

// GET /api/brain-assets/:id/signed-url — 動画再生用の signed URL を発行
router.get('/:id/signed-url', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const { data: asset, error } = await supabaseAdmin
    .from('brain_source_assets').select('*').eq('id', id).maybeSingle();
  if (error) return jsonError(c, 500, 'db_error', error.message);
  if (!asset) return jsonError(c, 404, 'not_found', 'アセットが見つかりません。');
  const t = assertTenantAccess(ctx, asset.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(asset.storage_path, 3600); // 1 hour
  if (signErr) return jsonError(c, 500, 'storage_error', signErr.message);
  return c.json({ signedUrl: signed.signedUrl, expiresIn: 3600 });
});

export default router;
