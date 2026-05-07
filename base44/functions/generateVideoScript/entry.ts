import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      clientCompanyId,
      purpose,
      targetAudience,
      durationSeconds = 60,
      speakingStyle = "誠実"
    } = await req.json();

    const company = (await base44.asServiceRole.entities.ClientCompany.filter({
      id: clientCompanyId
    }))?.[0];

    if (!company) {
      return Response.json({ error: "Company not found" }, { status: 404 });
    }

    const chunks = await base44.asServiceRole.entities.KnowledgeChunk.filter({
      clientCompanyId,
      status: "approved",
      audienceScope: "public"
    });

    const knowledgeText = chunks.slice(0, 20).map((c) => {
      return `- ${c.title}: ${c.chunkText}`;
    }).join("\n");

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o";

    const prompt = `
あなたは日本語の動画台本作成者です。
CompanyBrain AIの動画用に、自然な日本語の話し言葉で台本を作成してください。

会社名:
${company.companyName}

会社概要:
${company.companyOverview}

理念:
${company.mission}

価値観:
${company.values}

主なサービス:
${company.mainServices}

参照ナレッジ:
${knowledgeText}

動画目的:
${purpose}

対象者:
${targetAudience}

希望尺:
${durationSeconds}秒

話し方:
${speakingStyle}

条件:
- 一文を短くする
- 音声で聞きやすい日本語にする
- 専門用語はわかりやすくする
- 会社らしい誠実な印象にする
- 冒頭で興味を引く
- 最後に行動を促す
`;

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "video_script",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                script: { type: "string" },
                estimatedDurationSeconds: { type: "number" },
                notes: { type: "string" }
              },
              required: ["title", "script", "estimatedDurationSeconds", "notes"],
              additionalProperties: false
            }
          }
        }
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      return Response.json({ error: "OpenAI error", detail: errorText }, { status: 500 });
    }

    const data = await res.json();
    const outputText =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "{}";

    const parsed = JSON.parse(outputText);

    const videoProject = await base44.asServiceRole.entities.VideoProject.create({
      clientCompanyId,
      title: parsed.title,
      purpose,
      script: parsed.script,
      scriptStatus: "draft",
      status: "script_ready",
      durationSeconds: parsed.estimatedDurationSeconds
    });

    return Response.json({
      videoProjectId: videoProject.id,
      ...parsed
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});