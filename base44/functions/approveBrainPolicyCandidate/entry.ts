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

const APPROVER_ROLES = ["client_admin", "softdoing_admin"];

const CATEGORY_LABEL = {
  decisionPolicy: "判断基準",
  educationPolicy: "教育方針",
  salesPolicy: "営業方針",
  customerSupportPolicy: "顧客対応方針",
  escalationRules: "エスカレーション条件",
  forbiddenActions: "禁止事項",
  trainingFAQ: "新人研修Q&A",
  workReviewCriteria: "仕事レビュー基準",
  decisionExamples: "判断例",
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return jsonError("unauthorized", "認証が必要です。ログインしてください。", 401);
    }

    const body = await req.json();
    const { clientCompanyId, brainPolicyCandidateId, decision, reviewerNote, audienceScope } = body;

    if (!clientCompanyId) return jsonError("invalid_request", "clientCompanyId is required", 400);
    if (!brainPolicyCandidateId) return jsonError("invalid_request", "brainPolicyCandidateId is required", 400);
    if (!["approve", "reject"].includes(String(decision))) {
      return jsonError("invalid_request", "decision must be 'approve' or 'reject'", 400);
    }

    // テナント分離
    const tenant = assertTenantAccess(user, clientCompanyId);
    if (!tenant.allowed) {
      return jsonError(tenant.errorType, tenant.message, 403);
    }

    // 承認権限チェック: client_admin / softdoing_admin / Base44 admin のみ
    const role = resolveBusinessRole(user);
    if (!APPROVER_ROLES.includes(role) && !isGlobalAdmin(user)) {
      return jsonError(
        "forbidden_role",
        "方針候補を承認する権限がありません。client_admin または softdoing_admin が必要です。",
        403
      );
    }

    const candidate = await base44.asServiceRole.entities.BrainPolicyCandidate.get(brainPolicyCandidateId);
    if (!candidate) {
      return jsonError("candidate_not_found", "BrainPolicyCandidate が見つかりません。", 404);
    }

    // 候補のテナント整合
    if (!isGlobalAdmin(user) && String(candidate.clientCompanyId || "") !== String(clientCompanyId)) {
      return jsonError("tenant_mismatch", "この候補は別の会社に属しています。", 403);
    }

    if (candidate.status !== "draft") {
      return jsonError(
        "candidate_already_decided",
        `この候補は既に ${candidate.status} です。再度処理できません。`,
        409
      );
    }

    // 却下フロー
    if (decision === "reject") {
      const updated = await base44.asServiceRole.entities.BrainPolicyCandidate.update(brainPolicyCandidateId, {
        status: "rejected",
        reviewerNote: String(reviewerNote || ""),
        reviewedBy: user.id,
        reviewedAt: new Date().toISOString(),
      });
      return Response.json({ success: true, candidate: updated, decision: "rejected" });
    }

    // 承認フロー: KnowledgeSource → KnowledgeChunk を作成
    const person = await base44.asServiceRole.entities.BrainPerson.get(candidate.brainPersonId);
    if (!person) {
      return jsonError("brain_person_not_found", "BrainPerson が見つかりません。", 404);
    }

    // 同意確認: 最新 BrainConsentRecord が approved
    const consents = await base44.asServiceRole.entities.BrainConsentRecord.filter({
      clientCompanyId,
      brainPersonId: person.id,
    });
    const latestConsent = (consents || [])
      .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];
    if (!latestConsent || latestConsent.consentStatus !== "approved") {
      return jsonError(
        "consent_not_approved",
        "BrainPerson の同意が承認されていません。Knowledge化できません。",
        403
      );
    }

    // audienceScope のサニタイズ
    const requestedScope = String(audienceScope || candidate.suggestedAudienceScope || "internal").trim();
    let finalScope = ["public", "internal", "executive", "admin_only"].includes(requestedScope)
      ? requestedScope
      : "internal";
    // admin_only は softdoing_admin のみ
    if (finalScope === "admin_only" && !isGlobalAdmin(user)) {
      finalScope = "executive";
    }

    // 既存セッション単位の KnowledgeSource を再利用 or 新規作成
    let knowledgeSourceId;
    const existingSources = await base44.asServiceRole.entities.KnowledgeSource.filter({
      clientCompanyId,
      title: `Brain Interview - ${person.fullName} (${candidate.brainInterviewSessionId})`,
    });
    if (existingSources && existingSources.length > 0) {
      knowledgeSourceId = existingSources[0].id;
    } else {
      const newSource = await base44.asServiceRole.entities.KnowledgeSource.create({
        clientCompanyId,
        title: `Brain Interview - ${person.fullName} (${candidate.brainInterviewSessionId})`,
        sourceType: "manual",
        category: "management",
        audienceScope: finalScope,
        summary: `BrainPerson「${person.fullName}」の Brain Interview から人間承認された会社方針。`,
        tags: ["brain_interview", person.fullName].filter(Boolean),
        status: "approved",
        approvedBy: user.id,
        approvedAt: new Date().toISOString().slice(0, 10),
        riskLevel: "low",
      });
      knowledgeSourceId = newSource.id;
    }

    const categoryLabel = CATEGORY_LABEL[candidate.category] || candidate.category;
    const knowledgeChunk = await base44.asServiceRole.entities.KnowledgeChunk.create({
      clientCompanyId,
      knowledgeSourceId,
      title: `[${categoryLabel}] ${candidate.title || "(無題)"}`,
      chunkText: candidate.draftText,
      category: candidate.category,
      audienceScope: finalScope,
      tags: ["brain_interview", candidate.category, ...(Array.isArray(candidate.suggestedTags) ? candidate.suggestedTags : [])].slice(0, 12),
      keywords: [],
      status: "approved",
    });

    const updated = await base44.asServiceRole.entities.BrainPolicyCandidate.update(brainPolicyCandidateId, {
      status: "approved",
      reviewerNote: String(reviewerNote || ""),
      reviewedBy: user.id,
      reviewedAt: new Date().toISOString(),
      approvedKnowledgeChunkId: knowledgeChunk.id,
      approvedKnowledgeSourceId: knowledgeSourceId,
    });

    return Response.json({
      success: true,
      candidate: updated,
      decision: "approved",
      knowledgeChunkId: knowledgeChunk.id,
      knowledgeSourceId,
      audienceScope: finalScope,
    });
  } catch (error) {
    console.error("[approveBrainPolicyCandidate] Unexpected error:", error?.message, error?.stack);
    return jsonError("unexpected_error", error?.message || "Unexpected error", 500, { stack: error?.stack || null });
  }
});
