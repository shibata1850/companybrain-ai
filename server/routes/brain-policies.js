import { Hono } from 'hono';
import { requireAuth, jsonError } from '../lib/auth-middleware.js';
import { supabaseAdmin, assertTenantAccess, isGlobalAdmin } from '../lib/supabase.js';

const router = new Hono();
router.use('*', requireAuth);

const APPROVER_ROLES = new Set(['client_admin','softdoing_admin']);
const CATEGORY_LABEL = {
  decisionPolicy: '判断基準',
  educationPolicy: '教育方針',
  salesPolicy: '営業方針',
  customerSupportPolicy: '顧客対応方針',
  escalationRules: 'エスカレーション条件',
  forbiddenActions: '禁止事項',
  trainingFAQ: '新人研修Q&A',
  workReviewCriteria: '仕事レビュー基準',
  decisionExamples: '判断例',
};

// GET /api/brain-policies?brainPersonId=xxx[&status=draft|approved|rejected]
router.get('/', async (c) => {
  const ctx = c.get('ctx');
  const brainPersonId = c.req.query('brainPersonId');
  const status = c.req.query('status');
  if (!brainPersonId) return jsonError(c, 400, 'invalid_request', 'brainPersonId が必要です。');

  const { data: person } = await supabaseAdmin
    .from('brain_persons').select('client_company_id').eq('id', brainPersonId).maybeSingle();
  if (!person) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, person.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  let q = supabaseAdmin.from('brain_policy_candidates').select('*')
    .eq('brain_person_id', brainPersonId)
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return jsonError(c, 500, 'db_error', error.message);
  return c.json(data || []);
});

// POST /api/brain-policies/:id/decision
// body: { decision: 'approve' | 'reject', reviewerNote?, audienceScope? }
router.post('/:id/decision', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const { decision, reviewerNote, audienceScope } = await c.req.json();

  if (!['approve','reject'].includes(decision)) {
    return jsonError(c, 400, 'invalid_request', 'decision は approve / reject');
  }
  if (!APPROVER_ROLES.has(ctx.businessRole) && !isGlobalAdmin(ctx)) {
    return jsonError(c, 403, 'forbidden_role', '承認権限がありません。client_admin / softdoing_admin が必要です。');
  }

  const { data: candidate, error: cErr } = await supabaseAdmin
    .from('brain_policy_candidates').select('*').eq('id', id).maybeSingle();
  if (cErr) return jsonError(c, 500, 'db_error', cErr.message);
  if (!candidate) return jsonError(c, 404, 'not_found', 'BrainPolicyCandidate が見つかりません。');
  const t = assertTenantAccess(ctx, candidate.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  if (candidate.status !== 'draft') {
    return jsonError(c, 409, 'already_decided', `この候補は既に ${candidate.status} です。`);
  }

  if (decision === 'reject') {
    const { data, error } = await supabaseAdmin
      .from('brain_policy_candidates')
      .update({
        status: 'rejected',
        reviewer_note: reviewerNote || null,
        reviewed_by: ctx.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id).select().single();
    if (error) return jsonError(c, 500, 'db_error', error.message);
    return c.json({ candidate: data, decision: 'rejected' });
  }

  // approve: scope sanitize
  let scope = audienceScope || candidate.suggested_audience_scope || 'internal';
  if (!['public','internal','executive','admin_only'].includes(scope)) scope = 'internal';
  if (scope === 'admin_only' && !isGlobalAdmin(ctx)) scope = 'executive';

  // create knowledge_chunks
  const categoryLabel = CATEGORY_LABEL[candidate.category] || candidate.category;
  const title = `[${categoryLabel}] ${candidate.title || '(無題)'}`;
  const { data: chunk, error: chunkErr } = await supabaseAdmin
    .from('knowledge_chunks').insert({
      client_company_id: candidate.client_company_id,
      source_kind: 'brain_interview',
      source_ref_id: candidate.id,
      title,
      chunk_text: candidate.draft_text,
      category: candidate.category,
      audience_scope: scope,
      tags: [...new Set(['brain_interview', candidate.category, ...(candidate.suggested_tags || [])])].slice(0, 12),
      status: 'approved',
      approved_by: ctx.id,
    }).select().single();
  if (chunkErr) return jsonError(c, 500, 'db_error', chunkErr.message);

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('brain_policy_candidates')
    .update({
      status: 'approved',
      reviewer_note: reviewerNote || null,
      reviewed_by: ctx.id,
      reviewed_at: new Date().toISOString(),
      approved_knowledge_chunk_id: chunk.id,
    })
    .eq('id', id).select().single();
  if (updErr) return jsonError(c, 500, 'db_error', updErr.message);

  return c.json({ candidate: updated, decision: 'approved', knowledgeChunk: chunk, audienceScope: scope });
});

export default router;
