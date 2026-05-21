import {
  GoogleGenerativeAI,
  type Content,
  type Part,
} from '@google/generative-ai';
import { env } from './env';

let client: GoogleGenerativeAI | null = null;

function gemini(): GoogleGenerativeAI {
  if (!client) client = new GoogleGenerativeAI(env.geminiApiKey());
  return client;
}

/**
 * Transcribe a video file and produce a short summary in one call.
 * Returns plain transcript text plus a 1-2 sentence summary.
 */
export async function transcribeVideo(
  videoBytes: Buffer,
  mimeType: string,
): Promise<{ transcript: string; summary: string }> {
  const model = gemini().getGenerativeModel({ model: env.geminiTextModel() });

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

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [videoPart, { text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });

  const text = result.response.text();
  const parsed = JSON.parse(text) as { transcript: string; summary: string };
  return parsed;
}

/**
 * Generate embeddings for a list of text chunks.
 * Returns one vector per chunk (768 dims for text-embedding-004).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = gemini().getGenerativeModel({
    model: env.geminiEmbeddingModel(),
  });
  const vectors: number[][] = [];
  for (const text of texts) {
    const r = await model.embedContent(text);
    vectors.push(r.embedding.values);
  }
  return vectors;
}

/**
 * Given a question and retrieved knowledge chunks (the persona's own past
 * utterances), produce an answer in the persona's voice.
 */
export async function answerAsPersona(params: {
  personaName: string;
  question: string;
  knowledge: string[];
}): Promise<string> {
  const { personaName, question, knowledge } = params;
  const model = gemini().getGenerativeModel({ model: env.geminiTextModel() });

  const contextBlock =
    knowledge.length === 0
      ? '（参考発言なし）'
      : knowledge.map((k, i) => `【${i + 1}】 ${k}`).join('\n\n');

  const contents: Content[] = [
    {
      role: 'user',
      parts: [
        {
          text: `あなたは「${personaName}」という人物として回答してください。
以下はその人が過去に動画で話した内容の抜粋です。これを「自分の考え」「自分の知識」として一人称で答えてください。

# 参考発言
${contextBlock}

# ルール
- 一人称（私 / 僕 / 俺 など、参考発言と同じ口調）で答える
- 動画として読み上げられるので、自然な話し言葉にする
- 200〜400文字程度
- 箇条書きや見出しは使わない
- 「AIとして」「私はAIなので」のようなメタ発言は禁止
- 参考発言に直接の答えがない場合は、参考発言から推測される考え方で答える

# 質問
${question}`,
        },
      ],
    },
  ];

  const result = await model.generateContent({ contents });
  return result.response.text().trim();
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
