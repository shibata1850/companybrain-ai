import { Hono } from 'hono';
import crypto from 'node:crypto';
import { requireAuth, jsonError } from '../lib/auth-middleware.js';
import { db, tx, shapeInterview, shapeBrainPerson, toJsonArr } from '../lib/db.js';
import { assertTenantAccess, isGlobalAdmin } from '../lib/context.js';
import { generateText, generateJson } from '../lib/gemini.js';

const router = new Hono();
router.use('*', requireAuth);

router.get('/', (c) => {
  const ctx = c.get('ctx');
  const brainPersonId = c.req.query('brainPersonId');
  if (!brainPersonId) return jsonError(c, 400, 'invalid_request', 'brainPersonId が必要です。');
  const person = db.prepare('SELECT client_company_id FROM brain_persons WHERE id = ?').get(brainPersonId);
  if (!person) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, person.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const rows = db.prepare('SELECT * FROM brain_interview_sessions WHERE brain_person_id = ? ORDER BY started_at DESC')
    .all(brainPersonId);
  return c.json(rows.map(shapeInterview));
});

router.get('/:id', (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const row = db.prepare('SELECT * FROM brain_interview_sessions WHERE id = ?').get(id);
  if (!row) return jsonError(c, 404, 'not_found', 'セッションが見つかりません。');
  const t = assertTenantAccess(ctx, row.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);
  return c.json(shapeInterview(row));
});

router.post('/', async (c) => {
  const ctx = c.get('ctx');
  const { brainPersonId, useCaseType, title } = await c.req.json();
  if (!brainPersonId) return jsonError(c, 400, 'invalid_request', 'brainPersonId が必要です。');

  const personRow = db.prepare('SELECT * FROM brain_persons WHERE id = ?').get(brainPersonId);
  if (!personRow) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, personRow.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO brain_interview_sessions
      (id, client_company_id, brain_person_id, use_case_type, mode, status, title, interviewer_user_id)
    VALUES (?, ?, ?, ?, 'text_chat', 'in_progress', ?, ?)
  `).run(
    id,
    personRow.client_company_id,
    brainPersonId,
    useCaseType || null,
    title || `${personRow.full_name} - ${new Date().toLocaleDateString('ja-JP')}`,
    ctx.id
  );
  const row = db.prepare('SELECT * FROM brain_interview_sessions WHERE id = ?').get(id);
  return c.json(shapeInterview(row), 201);
});

router.post('/:id/turn', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const { userMessage } = await c.req.json();
  if (!userMessage?.trim()) return jsonError(c, 400, 'invalid_request', 'userMessage が必要です。');

  const sessionRow = db.prepare('SELECT * FROM brain_interview_sessions WHERE id = ?').get(id);
  if (!sessionRow) return jsonError(c, 404, 'not_found', 'セッションが見つかりません。');
  const t = assertTenantAccess(ctx, sessionRow.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);
  if (sessionRow.status !== 'in_progress') {
    return jsonError(c, 400, 'invalid_state', 'このセッションは既に終了しています。');
  }

  const session = shapeInterview(sessionRow);
  const personRow = db.prepare('SELECT * FROM brain_persons WHERE id = ?').get(session.brain_person_id);
  const person = shapeBrainPerson(personRow);

  const systemPrompt = `
あなたは「${person.full_name}」さんの会社の脳みそを育てるためのインタビュアー AI です。

【インタビュー対象】
氏名: ${person.full_name}
役職: ${person.role_title || '役職未設定'}

【ルール】
- 1 ターンで 1-2 個の質問だけ。「なぜそう判断するのか」「境界はどこか」「例外はあるか」を必ず深掘り。
- 答えにくい場合は具体例を例示して聞き直す。
- 短くまとめた共感や要約も加える。
- 自然な日本語、本文のみ（JSON ではない）。
`.trim();

  const history = (session.transcript || [])
    .map((m) => `${m.role === 'user' ? 'インタビュイー' : 'インタビュアー'}: ${m.text}`)
    .join('\n');
  const userPrompt = `${history ? `これまでの対話:\n${history}\n\n` : ''}インタビュイー: ${userMessage}\n\nインタビュアー:`;

  let answer;
  try {
    answer = await generateText({ systemPrompt, userPrompt });
  } catch (err) {
    return jsonError(c, 502, 'gemini_error', err.message);
  }

  const newTranscript = [
    ...(session.transcript || []),
    { role: 'user', text: userMessage, ts: Date.now() },
    { role: 'assistant', text: answer, ts: Date.now() },
  ];
  const turnCount = newTranscript.filter((m) => m.role === 'assistant').length;

  db.prepare('UPDATE brain_interview_sessions SET transcript = ?, turn_count = ? WHERE id = ?')
    .run(toJsonArr(newTranscript), turnCount, id);
  const updatedRow = db.prepare('SELECT * FROM brain_interview_sessions WHERE id = ?').get(id);
  return c.json({ assistantMessage: answer, session: shapeInterview(updatedRow) });
});

router.post('/:id/complete', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');

  const sessionRow = db.prepare('SELECT * FROM brain_interview_sessions WHERE id = ?').get(id);
  if (!sessionRow) return jsonError(c, 404, 'not_found', 'セッションが見つかりません。');
  const t = assertTenantAccess(ctx, sessionRow.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const session = shapeInterview(sessionRow);
  if (!session.transcript || session.transcript.length === 0) {
    return jsonError(c, 400, 'empty_transcript', '対話履歴が空です。');
  }
  const personRow = db.prepare('SELECT * FROM brain_persons WHERE id = ?').get(session.brain_person_id);
  const person = shapeBrainPerson(personRow);

  // mark completed
  db.prepare(`UPDATE brain_interview_sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).run(id);

  const transcriptText = (session.transcript || [])
    .map((m, i) => `【${i}】${m.role === 'user' ? 'Q' : 'A'}: ${m.text}`)
    .join('\n');

  const systemPrompt = `
あなたは企業ナレッジマネジメントの専門家です。
以下の対話履歴から、会社方針候補を category 別に抽出してください。

【BrainPerson】
氏名: ${person.full_name}
役職: ${person.role_title || ''}
担当領域: ${person.expertise_domain || ''}

【対話履歴】
${transcriptText}
`.trim();

  const userPrompt = `
次の JSON 形式で返してください：
{
  "candidates": [
    {
      "category": "decisionPolicy" | "educationPolicy" | "salesPolicy" | "customerSupportPolicy" | "escalationRules" | "forbiddenActions" | "trainingFAQ" | "workReviewCriteria" | "decisionExamples",
      "title": "短い見出し（30字以内）",
      "draftText": "方針本文（120-400字）",
      "sourceTurnIndexes": [対話のターン番号],
      "suggestedAudienceScope": "public" | "internal" | "executive" | "admin_only",
      "suggestedTags": ["タグ1","タグ2"]
    }
  ]
}

注意:
- 重複しないこと
- 対話で実際に言及された内容のみを根拠にすること
- admin_only は本当に機密な内容のみ
- 最大 12 件まで
`.trim();

  const schema = {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            title: { type: 'string' },
            draftText: { type: 'string' },
            sourceTurnIndexes: { type: 'array', items: { type: 'number' } },
            suggestedAudienceScope: { type: 'string' },
            suggestedTags: { type: 'array', items: { type: 'string' } },
          },
          required: ['category','title','draftText'],
        },
      },
    },
    required: ['candidates'],
  };

  let parsed;
  try {
    parsed = await generateJson({ systemPrompt, userPrompt, responseSchema: schema });
  } catch (err) {
    db.prepare(`UPDATE brain_interview_sessions SET extraction_status = 'failed', extraction_error = ? WHERE id = ?`)
      .run(err.message, id);
    return jsonError(c, 502, 'gemini_error', err.message);
  }

  const VALID_CATEGORIES = new Set([
    'decisionPolicy','educationPolicy','salesPolicy','customerSupportPolicy',
    'escalationRules','forbiddenActions','trainingFAQ','workReviewCriteria','decisionExamples'
  ]);

  const inserted = [];
  const insert = db.prepare(`
    INSERT INTO brain_policy_candidates
      (id, client_company_id, brain_person_id, brain_interview_session_id,
       category, title, draft_text, source_turn_indexes,
       suggested_audience_scope, suggested_tags, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `);

  tx(() => {
    for (const c0 of (parsed.candidates || [])) {
      if (!VALID_CATEGORIES.has(c0.category) || !c0.draftText) continue;
      let scope = c0.suggestedAudienceScope || 'internal';
      if (!['public','internal','executive','admin_only'].includes(scope)) scope = 'internal';
      if (scope === 'admin_only' && !isGlobalAdmin(ctx)) scope = 'executive';
      const candidateId = crypto.randomUUID();
      insert.run(
        candidateId,
        session.client_company_id,
        session.brain_person_id,
        id,
        c0.category,
        (c0.title || '').slice(0, 80),
        c0.draftText,
        toJsonArr(Array.isArray(c0.sourceTurnIndexes) ? c0.sourceTurnIndexes.filter(Number.isInteger) : []),
        scope,
        toJsonArr(Array.isArray(c0.suggestedTags) ? c0.suggestedTags.slice(0, 10) : []),
      );
      inserted.push(candidateId);
    }
  });

  db.prepare(`UPDATE brain_interview_sessions SET extracted_at = datetime('now'), extraction_status = 'completed', extraction_error = NULL WHERE id = ?`).run(id);

  return c.json({ candidatesCreated: inserted.length, candidateIds: inserted });
});

export default router;
