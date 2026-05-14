import { Hono } from 'hono';
import { requireAuth, jsonError } from '../lib/auth-middleware.js';
import { supabaseAdmin, assertTenantAccess, isGlobalAdmin } from '../lib/supabase.js';

const router = new Hono();

router.use('*', requireAuth);

// GET /api/brain-persons — 自テナント内の Brain Person 一覧
router.get('/', async (c) => {
  const ctx = c.get('ctx');
  if (!ctx.clientCompanyId && !isGlobalAdmin(ctx)) {
    return c.json([]);
  }
  let q = supabaseAdmin.from('brain_persons').select('*').order('created_at', { ascending: false });
  if (!isGlobalAdmin(ctx)) {
    q = q.eq('client_company_id', ctx.clientCompanyId);
  }
  const { data, error } = await q;
  if (error) return jsonError(c, 500, 'db_error', error.message);
  return c.json(data || []);
});

// GET /api/brain-persons/:id
router.get('/:id', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const { data, error } = await supabaseAdmin.from('brain_persons').select('*').eq('id', id).maybeSingle();
  if (error) return jsonError(c, 500, 'db_error', error.message);
  if (!data) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, data.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);
  return c.json(data);
});

// POST /api/brain-persons
router.post('/', async (c) => {
  const ctx = c.get('ctx');
  const body = await c.req.json();
  const clientCompanyId = body.client_company_id || ctx.clientCompanyId;
  if (!clientCompanyId) {
    return jsonError(c, 400, 'invalid_request', 'client_company_id が必要です。');
  }
  const t = assertTenantAccess(ctx, clientCompanyId);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const insert = {
    client_company_id: clientCompanyId,
    full_name: body.full_name || 'Untitled Brain',
    role_title: body.role_title || null,
    department: body.department || null,
    expertise_domain: body.expertise_domain || null,
    strength_fields: body.strength_fields || [],
    speaking_style: body.speaking_style || null,
    values_note: body.values_note || null,
    internal_use_allowed: body.internal_use_allowed !== false,
    external_use_allowed: !!body.external_use_allowed,
    status: body.status || 'draft',
    notes: body.notes || null,
    created_by: ctx.id,
  };
  const { data, error } = await supabaseAdmin.from('brain_persons').insert(insert).select().single();
  if (error) return jsonError(c, 500, 'db_error', error.message);
  return c.json(data, 201);
});

// PATCH /api/brain-persons/:id
router.patch('/:id', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const body = await c.req.json();

  // ターゲット取得 + テナント検証
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('brain_persons').select('*').eq('id', id).maybeSingle();
  if (fetchErr) return jsonError(c, 500, 'db_error', fetchErr.message);
  if (!existing) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, existing.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  // 許可フィールドだけ更新（client_company_id 等は変更不可）
  const allowed = [
    'full_name','role_title','department','expertise_domain','strength_fields',
    'speaking_style','values_note','internal_use_allowed','external_use_allowed',
    'status','notes',
  ];
  const update = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  const { data, error } = await supabaseAdmin
    .from('brain_persons').update(update).eq('id', id).select().single();
  if (error) return jsonError(c, 500, 'db_error', error.message);
  return c.json(data);
});

export default router;
