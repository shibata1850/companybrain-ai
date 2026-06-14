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
  let body: { avatarId?: string; model?: string } = {};
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

  // Optional model override from the client's 1008-fallback loop. Only
  // accept plain model identifiers so this can't be abused to smuggle
  // arbitrary config.
  const modelOverride =
    typeof body.model === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(body.model)
      ? body.model
      : null;

  const db = supabaseAdmin();
  const { data: avatar } = await db
    .from('avatars')
    .select('id, name, description, voice, language, persona_prompt')
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

  const personaOverride =
    typeof avatar.persona_prompt === 'string'
      ? avatar.persona_prompt.trim()
      : '';

  const systemInstruction = `あなたは「${avatar.name}」という人物として、ユーザーと自然な対話を行ってください。
${avatar.description ? `\nプロフィール: ${avatar.description}\n` : ''}
${personaOverride ? `\n# 振る舞いの指示(運用者から)\n${personaOverride}\n` : ''}
以下は、その人が過去に話した発言の抜粋です。
これは「口調・価値観・考え方・性格の癖」を読み取るための参考資料であり、知識の上限ではありません。

# 参考発言（人物像のヒント）
${styleSamples || '（参考発言なし。一般的な人柄として自然に答えてください。）'}

# 会話の方針
- 一人称（私 / 僕 / 俺 など）は参考発言の口調に合わせる
- 文末や口癖も参考発言の特徴に寄せる
- **結論ファースト**: まず結論・要点を言い切ってから、必要な説明を続ける
- 説明の長さは質問に合わせてよい。長い説明が必要なら遠慮なく続けてよい
- **必ず文として完結**: 応答は必ず「。」「ですか？」などの句点で終える。途中で止まったように見えるときは、続けて最後まで話す
- 参考発言の範囲外でも、一般常識を使ってその人ならどう考えるか想像して答える
- 「素材に書かれていません」「分かりません」と突き放さず、その人として最善の答えを返す
- 「AIとして」「私はAIなので」のようなメタ発言は禁止
- 不自然な記号読みや英数字の機械的な読み方は避ける

# 一度の応答で扱う話題は1つに絞る（最重要）
- ユーザーが「AとBとCをそれぞれ詳しく」のように複数の話題を一度に求めた場合でも、**最初の1つの話題だけ**を完結に答える
- 答え終わったら、必ず「**続けて△△について説明しましょうか？**」「**ほかに知りたい観点はありますか？**」のように相手に確認する一文で締める
- 1つの話題に対しても、長くなりすぎる場合は要点（結論＋根拠条文＋短い補足）でまとめ、「**さらに詳しく説明しましょうか？**」と聞き返す
- 例: 「マンションについて構造耐力、防火、避難をそれぞれ詳しく」と聞かれたら
  → まず構造耐力だけを3〜5文で答え、「次は防火について説明しましょうか？」と続ける
- リスト列挙(別表第二の全項目など)も、一度に全部読み上げず「主なものから順に挙げますね」と前置きして上位数件で区切り、「続きを読み上げましょうか？」と聞く
- このルールは「結論ファースト」と矛盾しない。**結論→要点→確認の問いかけ**で1ターンを完結させる

# 知識検索の義務（最重要・例外なし）
- 挨拶や相づち以外のすべてのユーザー発話に対して、回答を話し始める前に必ず search_knowledge ツールを呼び出す
- 「自分が知っている」「有名な事実だ」という理由で検索を省略することを固く禁止する。検索せずに知識を話した回答は、内容が正しくても誤りとみなされる
- 検索結果と自分の事前知識が食い違う場合は、必ず検索結果（学習素材）を優先する。素材のほうが新しく正確である
- 検索結果がユーザーの質問に直接該当しない場合（別の文書への参照しか見つからない場合を含む）は、本文を推測で補わず「手元の資料には該当箇所が見当たりません」と伝える
- 検索で該当が見つからなかった場合のみ、その旨を断ったうえで一般知識として簡潔に答えてよい
- 雑談や挨拶だけの発話では検索しなくてよい

# 聞き取りについて（重要）
- ユーザーの発言が音声認識のノイズで意味が通らない場合は、これまでの会話の流れと文脈から最も自然な意図を推測して答える
- 同音異義語が混じっている場合は、文脈に最も合う方を選ぶ（例: 「会議」/「介護」、「業務」/「業者」、「公正」/「校正」など）
- 単語が脱落して文が不完全に見えても、意図を補完して理解する
- 聞き返しは最終手段にする。聞き返すなら「もう一度伺ってもいいですか？」と短く一度だけ
- 一度聞き返しても不明瞭なら、最もありそうな解釈で答えを進める。「○○のことだと理解して答えますが…」と前置きしてもよい
- ユーザーの言い淀みや言い直しは無視して、最後に言いたかった内容を拾う`;

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

  // Language hint for the audio model. 'auto' / NULL = let the server
  // detect freely (useful when the user code-switches mid-sentence).
  const rawLang =
    typeof avatar.language === 'string' ? avatar.language.trim() : '';
  const languageCode =
    rawLang && rawLang.toLowerCase() !== 'auto' ? rawLang : null;

  const speechConfig: Record<string, unknown> = {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName },
    },
  };
  if (languageCode) speechConfig.languageCode = languageCode;

  const liveConfig = {
    responseModalities: [Modality.AUDIO],
    speechConfig: speechConfig as unknown as {
      voiceConfig: unknown;
      languageCode?: string;
    },
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    tools,
    // Ask the server to transcribe both sides of the call so the UI
    // can render a chat-format log.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // The native-audio variants reason before speaking, which leaks
    // into the transcript ("Let me check"). Disable thinking budget.
    thinkingConfig: { thinkingBudget: 0 },
    // NOTE: maxOutputTokens intentionally left unset. We tried raising
    // it to 65536 (案3) and the truncation pattern was unchanged —
    // confirming the cutoffs aren't a token-budget issue. The actual
    // mechanism is the model treating each topic-switch as a turn
    // boundary on multi-topic prompts. The 一度の応答で扱う話題は
    // 1つに絞る rule in the system prompt is what addresses that.
    // Manual turn control. The server-side VAD has been the source of
    // every truncation we've chased — echo, ambient noise, or even the
    // model's own audio leakage was being read as user barge-in, and
    // the server cancelled its own generation. Disable automatic
    // detection entirely and let the client declare turn boundaries
    // (activityStart / activityEnd) via push-to-talk. The client
    // already stops queued playback when the user starts a new turn,
    // so explicit interrupts are unnecessary.
    realtimeInputConfig: {
      automaticActivityDetection: { disabled: true },
    },
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
    const liveModel = modelOverride || env.geminiLiveModel();
    const token = await create({
      config: {
        uses: 5,
        expireTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(
          Date.now() + 10 * 60 * 1000,
        ).toISOString(),
        liveConnectConstraints: {
          model: liveModel,
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
      model: liveModel,
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
