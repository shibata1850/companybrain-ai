import { Hono } from 'hono';
import crypto from 'node:crypto';
import { requireAuth, jsonError } from '../lib/auth-middleware.js';
import { db, tx, shapeCandidate, shapeChunk, toJsonArr, fromJsonArr } from '../lib/db.js';
import { assertTenantAccess, isGlobalAdmin } from '../lib/context.js';

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

// GET /api/brain-policies?brainPersonId=&status=
router.get('/', (c) => {
  const ctx = c.get('ctx');
  const brainPersonId = c.req.query('brainPersonId');
  const status = c.req.query('status');
  if (!brainPersonId) return jsonError(c, 400, 'invalid_request', 'brainPersonId が必要です。');

  const person = db.prepare('SELECT client_company_id FROM brain_persons WHERE id = ?').get(brainPersonId);
  if (!person) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, person.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  let rows;
  if (status) {
    rows = db.prepare('SELECT * FROM brain_policy_candidates WHERE brain_person_id = ? AND status = ? ORDER BY created_at DESC')
      .all(brainPersonId, status);
  } else {
    rows = db.prepare('SELECT * FROM brain_policy_candidates WHERE brain_person_id = ? ORDER BY created_at DESC')
      .all(brainPersonId);
  }
  return c.json(rows.map(shapeCandidate));
});

// POST /api/brain-policies/:id/decision
router.post('/:id/decision', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const { decision, reviewerNote, audienceScope } = await c.req.json();

  if (!['approve','reject'].includes(decision)) {
    return jsonError(c, 400, 'invalid_request', 'decision は approve / reject');
  }
  if (!APPROVER_ROLES.has(ctx.businessRole) && !isGlobalAdmin(ctx)) {
    return jsonError(c, 403, 'forbidden_role', '承認権限がありません。');
  }

  const cand = db.prepare('SELECT * FROM brain_policy_candidates WHERE id = ?').get(id);
  if (!cand) return jsonError(c, 404, 'not_found', 'BrainPolicyCandidate が見つかりません。');
  const t = assertTenantAccess(ctx, cand.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);
  if (cand.status !== 'draft') {
    return jsonError(c, 409, 'already_decided', `この候補は既に ${cand.status} です。`);
  }

  if (decision === 'reject') {
    db.prepare(`
      UPDATE brain_policy_candidates
      SET status = 'rejected', reviewer_note = ?, reviewed_by = ?, reviewed_at = datetime('now')
      WHERE id = ?
    `).run(reviewerNote || null, ctx.id, id);
    const row = db.prepare('SELECT * FROM brain_policy_candidates WHERE id = ?').get(id);
    return c.json({ candidate: shapeCandidate(row), decision: 'rejected' });
  }

  // approve flow
  let scope = audienceScope || cand.suggested_audience_scope || 'internal';
  if (!['public','internal','executive','admin_only'].includes(scope)) scope = 'internal';
  if (scope === 'admin_only' && !isGlobalAdmin(ctx)) scope = 'executive';

  const categoryLabel = CATEGORY_LABEL[cand.category] || cand.category;
  const tags = [...new Set(['brain_interview', cand.category, ...fromJsonArr(cand.suggested_tags)])].slice(0, 12);

  const chunkId = crypto.randomUUID();
  tx(() => {
    db.prepare(`
      INSERT INTO knowledge_chunks
        (id, client_company_id, source_kind, source_ref_id, title, chunk_text,
         category, audience_scope, tags, status, approved_by)
      VALUES (?, ?, 'brain_interview', ?, ?, ?, ?, ?, ?, 'approved', ?)
    `).run(
      chunkId,
      cand.client_company_id,
      cand.id,
      `[${categoryLabel}] ${cand.title || '(無題)'}`,
      cand.draft_text,
      cand.category,
      scope,
      toJsonArr(tags),
      ctx.id
    );
    db.prepare(`
      UPDATE brain_policy_candidates
      SET status = 'approved', reviewer_note = ?, reviewed_by = ?, reviewed_at = datetime('now'),
          approved_knowledge_chunk_id = ?
      WHERE id = ?
    `).run(reviewerNote || null, ctx.id, chunkId, id);
  });

  const updatedCand = db.prepare('SELECT * FROM brain_policy_candidates WHERE id = ?').get(id);
  const chunk = db.prepare('SELECT * FROM knowledge_chunks WHERE id = ?').get(chunkId);
  return c.json({
    candidate: shapeCandidate(updatedCand),
    decision: 'approved',
    knowledgeChunk: shapeChunk(chunk),
    audienceScope: scope,
  });
});

export default router;
