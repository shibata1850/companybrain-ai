import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

function jsonError(errorType, message, status = 500, detail) {
  const body = { errorType, message, error: message };
  if (detail !== undefined) body.detail = detail;
  return Response.json(body, { status });
}

function resolveBusinessRole(user) {
  const businessRole = String(user?.businessRole || "").trim();
  if (businessRole) return businessRole;
  const base44Role = String(user?.role || "").toLowerCase().trim();
  if (base44Role === "admin") return "softdoing_admin";
  return "viewer";
}

function isGlobalAdmin(user) {
  const role = resolveBusinessRole(user);
  return role === "softdoing_admin" || String(user?.role || "").toLowerCase() === "admin";
}

function assertTenantAccess(user, clientCompanyId) {
  if (isGlobalAdmin(user)) return { allowed: true };
  const userCompanyId = String(user?.clientCompanyId || "");
  if (!userCompanyId) {
    return { allowed: false, errorType: "missing_user_company", message: "User clientCompanyId is missing" };
  }
  if (userCompanyId !== String(clientCompanyId || "")) {
    return { allowed: false, errorType: "tenant_mismatch", message: "You cannot access another company's data." };
  }
  return { allowed: true };
}

const POLICY_CATEGORIES = [
  "decisionPolicy",
  "educationPolicy",
  "salesPolicy",
  "customerSupportPolicy",
  "escalationRules",
  "forbiddenActions",
  "trainingFAQ",
  "workReviewCriteria",
  "decisionExamples",
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return jsonError("unauthorized", "認証が必要です。ログインしてください。", 401);
    }

    const { clientCompanyId, brainInterviewSessionId } = await req.json();

    if (!clientCompanyId) return jsonError("invalid_request", "clientCompanyId is required", 400);
    if (!brainInterviewSessionId) return jsonError("invalid_request", "brainInterviewSessionId is required", 400);

    // テナント分離: asServiceRole を使う前に必ずチェック
    const tenant = assertTenantAccess(user, clientCompanyId);
    if (!tenant.allowed) {
      return jsonError(tenant.errorType, tenant.message, 403);
    }

    // セッション取得
    const session = await base44.asServiceRole.entities.BrainInterviewSession.get(brainInterviewSessionId);
    if (!session) {
      return jsonError("session_not_found", "BrainInterviewSession が見つかりません。", 404);
    }

    // セッションのテナント整合
    if (!isGlobalAdmin(user) && String(session.clientCompanyId || "") !== String(clientCompanyId)) {
      return jsonError("tenant_mismatch", "このセッションは別の会社に属しています。", 403);
    }

    // BrainPerson 取得 + 同意確認
    const person = await base44.asServiceRole.entities.BrainPerson.get(session.brainPersonId);
    if (!person) {
      return jsonError("brain_person_not_found", "BrainPerson が見つかりません。", 404);
    }

    if (!isGlobalAdmin(user) && String(person.clientCompanyId || "") !== String(clientCompanyId)) {
      return jsonError("tenant_mismatch", "この BrainPerson は別の会社に属しています。", 403);
    }

    // 同意確認: 最新の BrainConsentRecord を取得し approved であること
    const consents = await base44.asServiceRole.entities.BrainConsentRecord.filter({
      clientCompanyId,
      brainPersonId: person.id,
    });
    const latestConsent = (consents || [])
      .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];
    if (!latestConsent || latestConsent.consentStatus !== "approved") {
      return jsonError(
        "consent_not_approved",
        "BrainPerson の同意が承認されていません。インタビュー結果を抽出できません。",
        403
      );
    }

    // transcript を取得
    let transcript;
    try {
      transcript = JSON.parse(session.transcriptJson || "[]");
    } catch (_e) {
      transcript = [];
    }

    if (!Array.isArray(transcript) || transcript.length === 0) {
      return jsonError("empty_transcript", "対話履歴が空です。少なくとも 1 ターン以上必要です。", 400);
    }

    // Gemini 呼び出し
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
    if (!geminiKey) {
      return jsonError("missing_gemini_key", "GEMINI_API_KEY が設定されていません。", 500);
    }

    const transcriptText = transcript
      .map((t, i) => `【${i}】${t.role === "user" ? "Q" : "A"}: ${String(t.text || "")}`)
      .join("\n");

    const systemPrompt = `
あなたは企業ナレッジマネジメントの専門家です。
以下の対話履歴から、会社方針候補を category 別に抽出してください。

【BrainPerson】
氏名: ${person.fullName || ""}
役職: ${person.roleTitle || ""}
担当領域: ${person.expertiseDomain || ""}

【対話履歴】
${transcriptText}

以下のJSON形式で出力してください：
{
  "candidates": [
    {
      "category": "decisionPolicy" | "educationPolicy" | "salesPolicy" | "customerSupportPolicy" | "escalationRules" | "forbiddenActions" | "trainingFAQ" | "workReviewCriteria" | "decisionExamples",
      "title": "短い見出し（30字以内）",
      "draftText": "方針本文（120-400字程度。会社で使える形に整える）",
      "sourceTurnIndexes": [対話のターン番号（【n】の n）],
      "suggestedAudienceScope": "public" | "internal" | "executive" | "admin_only",
      "suggestedTags": ["タグ1", "タグ2"]
    }
  ]
}

注意：
- 同じ内容の重複を避けてください
- 1 つの対話から複数 category を抽出して構いません
- "admin_only" は明らかに会社内部の機密判断に限定してください
- 推測ではなく、対話で言及された内容のみを根拠にしてください
- candidates は最大 12 件以内
`.trim();

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                candidates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      category: { type: "string" },
                      title: { type: "string" },
                      draftText: { type: "string" },
                      sourceTurnIndexes: { type: "array", items: { type: "number" } },
                      suggestedAudienceScope: { type: "string" },
                      suggestedTags: { type: "array", items: { type: "string" } },
                    },
                    required: ["category", "title", "draftText"],
                  },
                },
              },
              required: ["candidates"],
            },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      // 失敗を session に記録
      await base44.asServiceRole.entities.BrainInterviewSession.update(brainInterviewSessionId, {
        extractionStatus: "failed",
        extractionError: `Gemini ${geminiRes.status}: ${detail.slice(0, 300)}`,
      });
      return jsonError("gemini_api_error", "方針候補の抽出に失敗しました。", 502, { status: geminiRes.status, detail });
    }

    const geminiData = await geminiRes.json();
    let parsed;
    try {
      parsed = JSON.parse(geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    } catch (e) {
      await base44.asServiceRole.entities.BrainInterviewSession.update(brainInterviewSessionId, {
        extractionStatus: "failed",
        extractionError: "Gemini response JSON parse failed",
      });
      return jsonError("gemini_parse_error", "Gemini の応答 JSON を解析できませんでした。", 502, { error: e?.message });
    }

    const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    const created = [];
    const userIsAdmin = isGlobalAdmin(user);

    for (const c of rawCandidates) {
      const category = String(c.category || "").trim();
      const draftText = String(c.draftText || "").trim();
      if (!POLICY_CATEGORIES.includes(category) || !draftText) continue;

      // suggestedAudienceScope のサニタイズ
      let scope = String(c.suggestedAudienceScope || "internal").trim();
      if (!["public", "internal", "executive", "admin_only"].includes(scope)) scope = "internal";
      // admin_only は softdoing_admin が呼んだ時のみ許容（draft でも安全側に倒す）
      if (scope === "admin_only" && !userIsAdmin) scope = "executive";

      const candidate = await base44.asServiceRole.entities.BrainPolicyCandidate.create({
        clientCompanyId,
        brainPersonId: person.id,
        brainInterviewSessionId,
        category,
        title: String(c.title || "").slice(0, 80),
        draftText,
        sourceTurnIndexes: Array.isArray(c.sourceTurnIndexes) ? c.sourceTurnIndexes.filter((n) => Number.isInteger(n)) : [],
        suggestedAudienceScope: scope,
        suggestedTags: Array.isArray(c.suggestedTags) ? c.suggestedTags.map((t) => String(t)).slice(0, 10) : [],
        status: "draft",
      });
      created.push(candidate);
    }

    // セッションを抽出済みに更新
    await base44.asServiceRole.entities.BrainInterviewSession.update(brainInterviewSessionId, {
      extractedAt: new Date().toISOString(),
      extractionStatus: "completed",
      extractionError: "",
    });

    return Response.json({
      success: true,
      brainInterviewSessionId,
      candidatesCreated: created.length,
      candidates: created,
    });
  } catch (error) {
    console.error("[extractBrainPolicyCandidates] Unexpected error:", error?.message, error?.stack);
    return jsonError("unexpected_error", error?.message || "Unexpected error", 500, { stack: error?.stack || null });
  }
});
