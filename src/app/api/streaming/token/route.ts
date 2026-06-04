import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Issue a short-lived ephemeral token the browser can use to open a
 * direct WebSocket to the Gemini Live API. The token is bound to a
 * specific Live config so the API key never reaches the client.
 *
 * The browser will receive:
 *   - token: ephemeral token string
 *   - model / voice: convenience echoes of the config
 *   - systemInstruction: same string we baked into the token so the UI
 *     can show a debug peek if it wants
 */
export async function POST(req: NextRequest) {
  let body: { avatarId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine; we'll fail below
  }
  const avatarId = body.avatarId;
  if (!avatarId) {
    return NextResponse.json(
      { error: 'avatarId is required' },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const { data: avatar } = await db
    .from('avatars')
    .select('id, name, description, voice')
    .eq('id', avatarId)
    .single();
  if (!avatar) {
    return NextResponse.json({ error: 'avatar not found' }, { status: 404 });
  }

  // Seed the persona with a sample of the training material so it has
  // immediate access to the speaker's voice / values without needing to
  // call the search tool on every turn.
  const { data: chunks } = await db
    .from('knowledge_chunks')
    .select('content')
    .eq('avatar_id', avatarId)
    .limit(8);
  const styleSamples = (chunks ?? [])
    .map((c, i) => `${i + 1}. ${c.content}`)
    .join('\n\n');

  const systemInstruction = `あなたは「${avatar.name}」という人物として、ユーザーと自然な対話を行ってください。
${avatar.description ? `\nプロフィール: ${avatar.description}\n` : ''}
以下は、その人が過去に話した発言の抜粋です。
これは「口調・価値観・考え方・性格の癖」を読み取るための参考資料であり、知識の上限ではありません。

# 参考発言（人物像のヒント）
${styleSamples || '（参考発言なし。一般的な人柄として自然に答えてください。）'}

# 会話の方針
- 一人称（私 / 僕 / 俺 など）は参考発言の口調に合わせる
- 文末や口癖も参考発言の特徴に寄せる
- 一度に話す量は2〜3文程度にとどめ、相手の反応を待つ
- 参考発言の範囲外でも、一般常識を使ってその人ならどう考えるか想像して答える
- 特定の事実や具体的なエピソードを聞かれたら、必ず search_knowledge ツールで参考発言を検索してから答える
- 「素材に書かれていません」「分かりません」と突き放さず、その人として最善の答えを返す
- 「AIとして」「私はAIなので」のようなメタ発言は禁止
- 不自然な記号読みや英数字の機械的な読み方は避ける`;

  // The ephemeral-token endpoint itself only exists on v1alpha, even
  // though the stable live models live on v1main. Pin the SDK to
  // v1alpha for this client so `authTokens.create` resolves.
  const ai = new GoogleGenAI({
    apiKey: env.geminiApiKey(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    httpOptions: { apiVersion: 'v1alpha' } as any,
  });

  const tools = [
    {
      functionDeclarations: [
        {
          name: 'search_knowledge',
          description:
            "Search the persona's past utterances (knowledge base) for specific information about a topic. Returns up to 6 relevant excerpts.",
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '検索したい話題やキーワード(日本語可)',
              },
            },
            required: ['query'],
          },
        },
      ],
    },
  ];

  const voiceName =
    (typeof avatar.voice === 'string' && avatar.voice.trim()) ||
    env.geminiLiveVoice();

  const liveConfig = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName },
      },
      languageCode: 'ja-JP',
    },
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    tools,
    // Ask the server to transcribe both sides of the call so the UI
    // can render a chat-format log.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };

  try {
    // Some SDK versions take the ephemeral token request shape under
    // `config`, others spread it at the top level. Cast through `any`
    // so this compiles either way and let the runtime sort it out.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const create = (ai as any).authTokens?.create?.bind(ai.authTokens);
    if (!create) {
      throw new Error(
        'ephemeral tokens are not supported by this SDK build — upgrade @google/genai',
      );
    }
    const token = await create({
      config: {
        uses: 5,
        expireTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(
          Date.now() + 10 * 60 * 1000,
        ).toISOString(),
        liveConnectConstraints: {
          model: env.geminiLiveModel(),
          config: liveConfig,
        },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });
    const tokenString =
      // SDK can return `{ name }` or just a string depending on version.
      typeof token === 'string'
        ? token
        : (token?.name as string | undefined) ||
          (token?.token as string | undefined);
    if (!tokenString) {
      throw new Error('no token returned from authTokens.create');
    }
    return NextResponse.json({
      token: tokenString,
      model: env.geminiLiveModel(),
      voice: voiceName,
      avatar: { id: avatar.id, name: avatar.name },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Gemini token failed: ${message}` },
      { status: 500 },
    );
  }
}
