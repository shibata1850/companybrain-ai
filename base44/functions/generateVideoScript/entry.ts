import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { clientCompanyId, purpose, audience, duration, tone, additionalNotes } = body;

    if (!clientCompanyId || !purpose || !audience || !duration || !tone) {
      return Response.json({ error: "必須パラメータが不足しています" }, { status: 400 });
    }

    // 会社情報取得
    const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);

    // 承認済みナレッジチャンクを取得
    const chunks = await base44.asServiceRole.entities.KnowledgeChunk.filter({
      clientCompanyId,
      status: "approved",
    });

    const relevantChunks = chunks
      .filter(c => ["public", "internal"].includes(c.audienceScope))
      .slice(0, 10);

    const knowledgeText = relevantChunks.length > 0
      ? relevantChunks.map(c => `・${c.title}: ${c.chunkText?.slice(0, 200)}`).join("\n")
      : "（ナレッジ未登録）";

    const purposeLabel = {
      company_intro: "会社紹介",
      service_intro: "サービス紹介",
      sales: "営業用",
      training: "新入社員研修",
      recruiting: "採用",
      faq: "FAQ回答",
    }[purpose] || purpose;

    const audienceLabel = {
      partner: "取引先",
      prospect: "見込み客",
      new_employee: "新入社員",
      employee: "既存社員",
      executive: "経営者",
    }[audience] || audience;

    const toneLabel = {
      sincere: "誠実・丁寧",
      bright: "明るい・親しみやすい",
      ceo: "代表者風・権威ある",
      trainer: "研修講師風・分かりやすい",
      sales: "営業担当風・熱意ある",
    }[tone] || tone;

    const prompt = `
あなたは企業動画の台本ライターです。
以下の条件に従い、動画台本を作成してください。

【動画目的】${purposeLabel}
【対象者】${audienceLabel}
【尺】${duration}
【話し方】${toneLabel}
${additionalNotes ? `【補足・要望】${additionalNotes}` : ""}

【会社情報】
会社名: ${company?.companyName || ""}
概要: ${company?.companyOverview || ""}
ミッション: ${company?.mission || ""}
主なサービス: ${company?.mainServices || ""}
ブランドトーン: ${company?.brandTone || ""}

【参照ナレッジ】
${knowledgeText}

【台本作成ルール】
1. 話し言葉で書いてください（読み上げに適した自然な文体）
2. ${duration}に収まる文量にしてください（目安: 30秒=150字、60秒=300字、90秒=450字、3分=900字）
3. 冒頭に視聴者の注意を引くフックを入れてください
4. 中盤に具体的なベネフィットや事例を入れてください
5. 末尾にCTA（行動喚起）を入れてください
6. [間]や[強調]などの読み方の注釈を適宜入れてください

以下のJSON形式で返してください:
{
  "title": "台本タイトル",
  "script": "台本全文",
  "scenes": [
    { "name": "シーン名", "duration": "秒数", "text": "台本テキスト", "note": "演出メモ" }
  ],
  "totalCharCount": 文字数,
  "estimatedDuration": "推定尺"
}
`.trim();

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return Response.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      return Response.json({ error: "Gemini API error", detail }, { status: 500 });
    }

    const geminiData = await geminiRes.json();
    const outputText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      parsed = { title: "生成された台本", script: outputText, scenes: [], totalCharCount: outputText.length, estimatedDuration: duration };
    }

    return Response.json({ success: true, ...parsed });

  } catch (error) {
    console.error("[generateVideoScript]", error?.message);
    return Response.json({ error: error?.message || "Unexpected error" }, { status: 500 });
  }
});