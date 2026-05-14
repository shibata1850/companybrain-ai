import { Hono } from 'hono';
import { requireAuth, jsonError } from '../lib/auth-middleware.js';
import { db, shapeBrainPerson, fromJsonArr } from '../lib/db.js';
import { assertTenantAccess } from '../lib/context.js';
import { generateText } from '../lib/gemini.js';

const router = new Hono();
router.use('*', requireAuth);

/**
 * POST /api/chat
 * body: { brainPersonId, message }
 */
router.post('/', async (c) => {
  const ctx = c.get('ctx');
  const { brainPersonId, message } = await c.req.json();
  if (!brainPersonId || !message) {
    return jsonError(c, 400, 'invalid_request', 'brainPersonId と message が必要です。');
  }

  const personRow = db.prepare('SELECT * FROM brain_persons WHERE id = ?').get(brainPersonId);
  if (!personRow) return jsonError(c, 404, 'not_found', 'BrainPerson が見つかりません。');
  const t = assertTenantAccess(ctx, personRow.client_company_id);
  if (!t.ok) return jsonError(c, t.code, t.errorType, t.message);
  const person = shapeBrainPerson(personRow);

  // ロールに応じた audience_scope
  const role = ctx.businessRole;
  const allowedScopes = (() => {
    if (role === 'softdoing_admin') return ['public','internal','executive','admin_only'];
    if (role === 'client_admin' || role === 'executive') return ['public','internal','executive'];
    if (['editor','employee'].includes(role)) return ['public','internal'];
    return ['public'];
  })();

  const placeholders = allowedScopes.map(() => '?').join(',');
  const knowledge = db.prepare(
    `SELECT title, chunk_text, category, audience_scope
     FROM knowledge_chunks
     WHERE client_company_id = ? AND status = 'approved'
       AND audience_scope IN (${placeholders})
     ORDER BY approved_at DESC LIMIT 12`
  ).all(person.client_company_id, ...allowedScopes);

  const sourcesText = knowledge.map((k, i) =>
    `【Source ${i + 1}】(${k.category || ''} / ${k.audience_scope})\nタイトル: ${k.title}\n内容: ${k.chunk_text}`
  ).join('\n\n');

  const systemPrompt = `
あなたは「${person.full_name}」（${person.role_title || '役職未設定'}）の AI アバターです。
本人の話し方・考え方・判断基準を最大限再現して回答してください。

【話し方の特徴】
${person.speaking_style || '（未登録）'}

【価値観】
${person.values_note || '（未登録）'}

【担当領域】
${person.expertise_domain || '（未登録）'}

【強み分野】
${(person.strength_fields || []).join('、') || '（未登録）'}

【会社で承認済みの方針・判断基準】
${sourcesText || '（まだ承認済みナレッジはありません）'}

【重要な前提】
- あなたは AI アバターであり、本人そのものではありません。
- 重要な判断は必ず人間に最終確認を促してください。
- 自然な日本語の話し言葉で、簡潔に答えてください。
`.trim();

  try {
    const answer = await generateText({ systemPrompt, userPrompt: `ユーザー質問: ${message}` });
    return c.json({ answer });
  } catch (err) {
    return jsonError(c, 502, 'gemini_error', err.message);
  }
});

export default router;
