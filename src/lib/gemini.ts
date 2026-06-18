import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { env } from './env';

let client: GoogleGenAI | null = null;

function gemini(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: env.geminiApiKey() });
  }
  return client;
}

/**
 * Try the preferred model first; if it's not available on this API key
 * (404 / permission errors), retry with each fallback in order. Lets us
 * point at the latest model in config without breaking if the user's
 * account hasn't been opted into it yet.
 */
const ANSWER_MODEL_FALLBACKS = [
  'gemini-2.5-pro',
  'gemini-pro-latest',
  'gemini-2.5-flash',
  'gemini-flash-latest',
];
const TRANSCRIBE_MODEL_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-pro',
];

async function generateWithFallback(opts: {
  preferred: string;
  fallbacks: string[];
  contents: Content[];
  config?: Record<string, unknown>;
}): Promise<string> {
  const tried = new Set<string>();
  const candidates = [opts.preferred, ...opts.fallbacks].filter((m) => {
    if (tried.has(m)) return false;
    tried.add(m);
    return true;
  });
  let lastError: unknown = null;
  for (const model of candidates) {
    try {
      const response = await gemini().models.generateContent({
        model,
        contents: opts.contents,
        config: opts.config,
      });
      return response.text ?? '';
    } catch (e) {
      lastError = e;
      console.warn(
        `[gemini] text model "${model}" failed, trying next:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('All text models failed');
}

/**
 * Transcribe a video file and produce a short summary in one call.
 * Returns plain transcript text plus a 1-2 sentence summary.
 */
export async function transcribeVideo(
  videoBytes: Buffer,
  mimeType: string,
): Promise<{ transcript: string; summary: string }> {
  const videoPart: Part = {
    inlineData: {
      data: videoBytes.toString('base64'),
      mimeType,
    },
  };

  const prompt = `この動画に映っている人物の発言を、日本語で忠実に文字起こししてください。
出力は次のJSON形式のみ。前後に説明文を書かないでください。

{
  "transcript": "<話している内容を一字一句、句読点付きで書き起こす>",
  "summary": "<この動画で語られている内容を1〜2文で要約>"
}`;

  const text = await generateWithFallback({
    preferred: env.geminiTranscribeModel(),
    fallbacks: TRANSCRIBE_MODEL_FALLBACKS,
    contents: [{ role: 'user', parts: [videoPart, { text: prompt }] }],
    config: { responseMimeType: 'application/json' },
  });
  const parsed = JSON.parse(text) as { transcript: string; summary: string };
  return parsed;
}

/**
 * Generate 768-dim embeddings for a list of text chunks. The pgvector
 * column is sized vector(768), so we always request that dimensionality.
 *
 * Models change name and availability often, so we try the configured
 * model first and then fall back through a list of known-working ones.
 * The deprecated `embedding-001` was removed — it 404s on v1beta now.
 */
const EMBEDDING_FALLBACKS = [
  'gemini-embedding-001',
  'text-embedding-004',
];

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const preferred = env.geminiEmbeddingModel();
  const candidates = [
    preferred,
    ...EMBEDDING_FALLBACKS.filter((m) => m !== preferred),
  ];

  const attempts: Array<{ model: string; error: string }> = [];
  for (const modelName of candidates) {
    try {
      const vectors: number[][] = [];
      for (const text of texts) {
        const response = await gemini().models.embedContent({
          model: modelName,
          contents: text,
          config: { outputDimensionality: 768 },
        });
        const values = response.embeddings?.[0]?.values;
        if (!values) throw new Error('no embedding values returned');
        if (values.length !== 768) {
          throw new Error(
            `expected 768-dim vector, got ${values.length}-dim`,
          );
        }
        vectors.push(values);
      }
      return vectors;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      attempts.push({ model: modelName, error: message });
      console.warn(`[gemini] embedding model "${modelName}" failed:`, message);
    }
  }
  const summary = attempts
    .map((a) => `• ${a.model}: ${a.error}`)
    .join('\n');
  throw new Error(
    `すべての埋め込みモデルが失敗しました。\n${summary}\n\n` +
      `/api/debug/embedding-models で利用可能なモデルを確認してください。`,
  );
}

export type AnswerLength = 'short' | 'standard' | 'detailed';

const LENGTH_RULE: Record<AnswerLength, string> = {
  short: '50〜80文字以内で一言で答える。',
  standard: '80〜150文字以内で簡潔に。要点だけを話す。',
  detailed: '200〜400文字程度。背景や具体例まで丁寧に話す。',
};

/**
 * Given a question and retrieved knowledge chunks (the persona's own past
 * utterances), produce an answer in the persona's voice.
 */
export async function answerAsPersona(params: {
  personaName: string;
  question: string;
  knowledge: string[];
  length?: AnswerLength;
  /** Optional model override (used by plan-tier routing). */
  model?: string;
}): Promise<string> {
  const {
    personaName,
    question,
    knowledge,
    length = 'standard',
    model,
  } = params;

  const contextBlock =
    knowledge.length === 0
      ? '（参考発言なし）'
      : knowledge.map((k, i) => `【${i + 1}】 ${k}`).join('\n\n');

  const contents: Content[] = [
    {
      role: 'user',
      parts: [
        {
          text: `あなたは「${personaName}」という人物になりきって回答してください。

以下は、その人が過去に話した発言の抜粋です。
これは「その人の口調・価値観・考え方・性格の癖」を知るための参考資料です。
学習素材として丸暗記する知識ではなく、人物像を掴むためのヒントとして扱ってください。

# 参考発言（口調・考え方を読み取るため）
${contextBlock}

# 答え方の方針
- 一人称（私 / 僕 / 俺 など）は参考発言の口調に合わせる
- 文末の言い回し・テンポ・好む表現も参考発言の癖に寄せる
- 質問内容は参考発言の範囲を超えても構わない。一般常識や世の中の知識を自由に使って答えてよい
- 参考発言に直接の答えがない場合でも、「その人ならどう考え、どう答えるか」を想像してその人として答える
- 「素材に書かれていません」「参考発言にはありません」と突き放したり、知らないと答えるのは禁止
- 「AI として」「私は AI なので」のようなメタ発言も禁止
- 動画として読み上げられるので、自然な話し言葉にする
- ${LENGTH_RULE[length]}
- 箇条書きや見出しは使わない

# 質問
${question}`,
        },
      ],
    },
  ];

  const text = await generateWithFallback({
    preferred: model ?? env.geminiAnswerModel(),
    fallbacks: ANSWER_MODEL_FALLBACKS,
    contents,
  });
  return text.trim();
}

/**
 * Split a long transcript into overlapping chunks suitable for embedding.
 */
export function chunkTranscript(
  transcript: string,
  chunkSize = 400,
  overlap = 50,
): string[] {
  const clean = transcript.replace(/\s+/g, ' ').trim();
  if (clean.length <= chunkSize) return clean.length > 0 ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    chunks.push(clean.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}
