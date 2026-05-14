import { Hono } from 'hono';
import { requireAuth, jsonError } from '../lib/auth-middleware.js';
import { supabaseAdmin, assertTenantAccess, isGlobalAdmin } from '../lib/supabase.js';
import { generateText, generateJson } from '../lib/gemini.js';

const router = new Hono();
router.use('*', requireAuth);

// GET /api/brain-interviews?brainPersonId=xxx
router.get('/', async (c) => {
  const ctx = c.get('ctx');
  const brainPersonId = c.req.query('brainPersonId');
  if (!brainPersonId) return jsonError(c, 400, 'invalid_request', 'brainPersonId が必要です。');

  const { data: person } = await supabaseAdmin
    .from('brain_persons').select('client_company_id').eq('id', brainPersonId).maybeSingle();
  if (!person) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, person.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const { data, error } = await supabaseAdmin
    .from('brain_interview_sessions').select('*')
    .eq('brain_person_id', brainPersonId)
    .order('started_at', { ascending: false });
  if (error) return jsonError(c, 500, 'db_error', error.message);
  return c.json(data || []);
});

// GET /api/brain-interviews/:id
router.get('/:id', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const { data, error } = await supabaseAdmin
    .from('brain_interview_sessions').select('*').eq('id', id).maybeSingle();
  if (error) return jsonError(c, 500, 'db_error', error.message);
  if (!data) return jsonError(c, 404, 'not_found', 'セッションが見つかりません。');
  const t = assertTenantAccess(ctx, data.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);
  return c.json(data);
});

// POST /api/brain-interviews — 新規セッション開始
// body: { brainPersonId, useCaseType?, title? }
router.post('/', async (c) => {
  const ctx = c.get('ctx');
  const body = await c.req.json();
  const { brainPersonId, useCaseType, title } = body;
  if (!brainPersonId) return jsonError(c, 400, 'invalid_request', 'brainPersonId が必要です。');

  const { data: person } = await supabaseAdmin
    .from('brain_persons').select('client_company_id, full_name').eq('id', brainPersonId).maybeSingle();
  if (!person) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, person.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  const { data, error } = await supabaseAdmin.from('brain_interview_sessions').insert({
    client_company_id: person.client_company_id,
    brain_person_id: brainPersonId,
    use_case_type: useCaseType || null,
    mode: 'text_chat',
    status: 'in_progress',
    title: title || `${person.full_name} - ${new Date().toLocaleDateString('ja-JP')}`,
    transcript: [],
    interviewer_user_id: ctx.id,
  }).select().single();
  if (error) return jsonError(c, 500, 'db_error', error.message);
  return c.json(data, 201);
});

// POST /api/brain-interviews/:id/turn — 1 ターン進める
// body: { userMessage }
// 返値: { assistantMessage, session }
router.post('/:id/turn', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');
  const { userMessage } = await c.req.json();
  if (!userMessage?.trim()) return jsonError(c, 400, 'invalid_request', 'userMessage が必要です。');

  const { data: session, error: sErr } = await supabaseAdmin
    .from('brain_interview_sessions').select('*').eq('id', id).maybeSingle();
  if (sErr) return jsonError(c, 500, 'db_error', sErr.message);
  if (!session) return jsonError(c, 404, 'not_found', 'セッションが見つかりません。');
  const t = assertTenantAccess(ctx, session.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  if (session.status !== 'in_progress') {
    return jsonError(c, 400, 'invalid_state', 'このセッションは既に終了しています。');
  }

  const { data: person } = await supabaseAdmin
    .from('brain_persons').select('*').eq('id', session.brain_person_id).maybeSingle();

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
- 最後に「もう少し聞きたいことはありますか？」と促すこともある。
`.trim();

  // 過去の transcript を文脈として渡す
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

  const { data: updated, error: uErr } = await supabaseAdmin
    .from('brain_interview_sessions')
    .update({
      transcript: newTranscript,
      turn_count: newTranscript.filter((m) => m.role === 'assistant').length,
    })
    .eq('id', id).select().single();
  if (uErr) return jsonError(c, 500, 'db_error', uErr.message);

  return c.json({ assistantMessage: answer, session: updated });
});

// POST /api/brain-interviews/:id/complete — セッション終了 + Gemini で方針候補を抽出
router.post('/:id/complete', async (c) => {
  const ctx = c.get('ctx');
  const id = c.req.param('id');

  const { data: session } = await supabaseAdmin
    .from('brain_interview_sessions').select('*').eq('id', id).maybeSingle();
  if (!session) return jsonError(c, 404, 'not_found', 'セッションが見つかりません。');
  const t = assertTenantAccess(ctx, session.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);

  if (!session.transcript || session.transcript.length === 0) {
    return jsonError(c, 400, 'empty_transcript', '対話履歴が空です。');
  }

  const { data: person } = await supabaseAdmin
    .from('brain_persons').select('*').eq('id', session.brain_person_id).maybeSingle();

  // mark as completed + extracting
  await supabaseAdmin.from('brain_interview_sessions').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('id', id);

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
    await supabaseAdmin.from('brain_interview_sessions').update({
      extraction_status: 'failed', extraction_error: err.message,
    }).eq('id', id);
    return jsonError(c, 502, 'gemini_error', err.message);
  }

  const VALID_CATEGORIES = new Set([
    'decisionPolicy','educationPolicy','salesPolicy','customerSupportPolicy',
    'escalationRules','forbiddenActions','trainingFAQ','workReviewCriteria','decisionExamples'
  ]);

  const created = [];
  for (const c0 of (parsed.candidates || [])) {
    if (!VALID_CATEGORIES.has(c0.category) || !c0.draftText) continue;
    let scope = c0.suggestedAudienceScope || 'internal';
    if (!['public','internal','executive','admin_only'].includes(scope)) scope = 'internal';
    if (scope === 'admin_only' && !isGlobalAdmin(ctx)) scope = 'executive';

    const { data: row, error } = await supabaseAdmin.from('brain_policy_candidates').insert({
      client_company_id: session.client_company_id,
      brain_person_id: session.brain_person_id,
      brain_interview_session_id: id,
      category: c0.category,
      title: (c0.title || '').slice(0, 80),
      draft_text: c0.draftText,
      source_turn_indexes: Array.isArray(c0.sourceTurnIndexes) ? c0.sourceTurnIndexes.filter(Number.isInteger) : [],
      suggested_audience_scope: scope,
      suggested_tags: Array.isArray(c0.suggestedTags) ? c0.suggestedTags.slice(0, 10) : [],
      status: 'draft',
    }).select().single();
    if (!error && row) created.push(row);
  }

  await supabaseAdmin.from('brain_interview_sessions').update({
    extracted_at: new Date().toISOString(),
    extraction_status: 'completed',
    extraction_error: null,
  }).eq('id', id);

  return c.json({ candidatesCreated: created.length, candidates: created });
});

export default router;
