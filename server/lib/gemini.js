/**
 * Gemini API クライアント（サーバーサイド専用）
 * 環境変数 GEMINI_API_KEY を使う。フロントには絶対渡さない。
 */
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

if (!API_KEY) {
  console.warn('[gemini] GEMINI_API_KEY is not set.');
}

/**
 * テキスト生成（プレーン）
 */
export async function generateText({ systemPrompt, userPrompt }) {
  if (!API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const fullPrompt = [systemPrompt, userPrompt].filter(Boolean).join('\n\n');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * JSON 構造化生成（responseSchema を強制）
 */
export async function generateJson({ systemPrompt, userPrompt, responseSchema }) {
  if (!API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const fullPrompt = [systemPrompt, userPrompt].filter(Boolean).join('\n\n');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        ...(responseSchema ? { responseSchema } : {}),
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Gemini response is not valid JSON: ${text.slice(0, 200)}`);
  }
}
