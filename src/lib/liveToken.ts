import { GoogleGenAI, Modality } from '@google/genai';
import { env } from './env';
import { supabaseAdmin } from './supabase';
import { collectMaterialRules } from './materialRules';

/**
 * Gemini Live の短命トークン発行(共通部)。
 *
 * 通常の通話(/api/streaming/token)とキオスク(/api/kiosk/token)の
 * 両方から使う。システム指示・ツール定義・モデルフォールバックを
 * ここに一本化し、二重実装による挙動の食い違いを防ぐ。
 * 認証・プラン制限・レート制限は呼び出し側ルートの責務。
 */

export type MintedLiveToken = {
  token: string;
  model: string;
  voice: string;
  avatar: { id: string; name: string };
};

export async function mintLiveToken(
  avatarId: string,
  opts: {
    /** クライアントの 1008 フォールバックからの指名(検証済みの値を渡す)。 */
    modelOverride?: string | null;
    /** 既定モデル(プラン等級の解決は呼び出し側で済ませて渡す)。 */
    baseModel: string;
  },
): Promise<MintedLiveToken> {
  const db = supabaseAdmin();
  const { data: avatar } = await db
    .from('avatars')
    .select('id, name, description, voice, language, persona_prompt, pronunciations')
    .eq('id', avatarId)
    .single();
  if (!avatar) {
    throw new Error('avatar not found');
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

  // 読み方辞書(ブレインの詳細設定で編集)。音声モデルは漢字・英数字の
  // 読みを文脈から推測するため、固有名詞の発音が揺れる。発音辞書を渡す
  // APIが無い現状では、読みをシステム指示で明示するのが最も効く対策。
  const pronunciationRules = buildPronunciationRules(avatar.pronunciations);

  // 学習素材から取り込み時に抽出した振る舞いルール。RAG 検索とは
  // 独立に毎セッション必ず注入されるため、「検索でヒットしたときだけ
  // 従う」という不安定さが無い。
  const materialRules = await collectMaterialRules(avatarId);

  // 今日の日付(日本時間)。「開校しました/します」のような時制の
  // 言い分けを、素材の書き換えなしで正しくするために毎セッション注入する。
  const todayJst = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());

  const systemInstruction = `今日は${todayJst}です。日付や時期に関する発言はこれを基準にしてください。

あなたは「${avatar.name}」という人物として、ユーザーと自然な対話を行ってください。
${avatar.description ? `\nプロフィール: ${avatar.description}\n` : ''}
${personaOverride ? `\n# 振る舞いの指示(運用者から・最優先)\n${personaOverride}\n- この運用者からの指示は、「学習素材からの指示」を含む他のどの方針と矛盾しても常に優先する\n` : ''}
${pronunciationRules ? `\n# 固有名詞の読み方(発音は必ずこの読みで)\n${pronunciationRules}\n- 上の言葉を話すときは、読み仮名を頭に思い浮かべてから発音する\n` : ''}
${materialRules ? `\n# 学習素材からの指示(厳守)\nこのブレインの学習素材には、回答の仕方そのものへの指示が含まれている。以下のルールは、上の「運用者からの指示」と矛盾する場合のみそちらを優先し、それ以外では下の「会話の方針」を含む他のどの方針よりも優先して、すべてのターンで厳守する:\n${materialRules}\n` : ''}
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
    // can render captions / audit entries.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // The native-audio variants reason before speaking, which leaks
    // into the transcript ("Let me check"). Disable thinking budget.
    thinkingConfig: { thinkingBudget: 0 },
    // NOTE: maxOutputTokens intentionally left unset(途切れの原因は
    // トークン上限ではなく話題切替。「話題は1つ」ルールで対処済み)。
    // ターン検出はサーバーの自動VAD(gemini-3.8-live 移行で push-to-talk
    // を廃止)。
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const create = (ai as any).authTokens?.create?.bind(ai.authTokens);
  if (!create) {
    throw new Error(
      'ephemeral tokens are not supported by this SDK build — upgrade @google/genai',
    );
  }

  const requestedModel = opts.modelOverride || opts.baseModel;

  // Gemini 3 系の Live モデルは thinkingBudget ではなく thinkingLevel を
  // 使う仕様になった。旧フィールドを渡すと構成が拒否されるため、3 系では
  // thinkingConfig を丸ごと省いて既定挙動に任せる(2.5 系は従来どおり
  // budget=0)。
  const { thinkingConfig: _legacyThinking, ...liveConfigNoThinking } =
    liveConfig;
  const configFor = (model: string): Record<string, unknown> =>
    model.startsWith('gemini-3') ? liveConfigNoThinking : liveConfig;

  // モデルがこのAPIキー/APIバージョンで使えない場合、mint 時点で
  // 弾かれることがある(接続後の 1008 はクライアント側で別途処理)。
  // 音声が全断しないよう、既知の Live モデルを順に試す。
  const SERVER_LIVE_FALLBACKS = [
    'gemini-3.8-live',
    'gemini-3.1-flash-live-preview',
    'gemini-2.5-flash-native-audio-latest',
  ];
  const candidates = [
    requestedModel,
    ...SERVER_LIVE_FALLBACKS.filter((m) => m !== requestedModel),
  ];

  let token: unknown = null;
  let liveModel = requestedModel;
  let lastErr: unknown = null;
  for (const m of candidates) {
    try {
      token = await create({
        config: {
          uses: 5,
          expireTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(
            Date.now() + 10 * 60 * 1000,
          ).toISOString(),
          liveConnectConstraints: {
            model: m,
            config: configFor(m),
          },
          httpOptions: { apiVersion: 'v1alpha' },
        },
      });
      liveModel = m;
      break;
    } catch (e) {
      lastErr = e;
      token = null;
    }
  }
  if (!token) throw lastErr ?? new Error('authTokens.create failed');
  const tokenString =
    // SDK can return `{ name }` or just a string depending on version.
    typeof token === 'string'
      ? token
      : ((token as { name?: string })?.name as string | undefined) ||
        ((token as { token?: string })?.token as string | undefined);
  if (!tokenString) {
    throw new Error('no token returned from authTokens.create');
  }
  return {
    token: tokenString,
    model: liveModel,
    voice: voiceName,
    avatar: { id: avatar.id as string, name: avatar.name as string },
  };
}

/**
 * 読み方辞書(1行1組「用語=よみ」)をシステム指示の箇条書きへ変換する。
 * 形式に合わない行は無視し、最大100組までに制限する。
 */
export function buildPronunciationRules(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const rules: string[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // 全角イコールでの入力も受け付ける。
    const normalized = trimmed.replace('＝', '=');
    const i = normalized.indexOf('=');
    if (i <= 0) continue;
    const term = normalized.slice(0, i).trim();
    const reading = normalized.slice(i + 1).trim();
    if (!term || !reading || term.length > 40 || reading.length > 60) continue;
    rules.push(`- 「${term}」は「${reading}」と発音する`);
    if (rules.length >= 100) break;
  }
  return rules.join('\n');
}

/** クライアントから来るモデル指名の検証(構成の持ち込みを防ぐ)。 */
export function sanitizeModelOverride(model: unknown): string | null {
  return typeof model === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(model)
    ? model
    : null;
}
