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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return jsonError("unauthorized", "認証が必要です。ログインしてください。", 401);
    }

    const { clientCompanyId, avatarProfileId, script, purpose, mode = "heygen_avatar_video" } = await req.json();

    if (!clientCompanyId) return jsonError("invalid_request", "clientCompanyId is required", 400);
    if (!avatarProfileId) return jsonError("invalid_request", "avatarProfileId is required", 400);

    // テナント分離: asServiceRole を使う前に必ずチェック
    const tenant = assertTenantAccess(user, clientCompanyId);
    if (!tenant.allowed) {
      return jsonError(tenant.errorType, tenant.message, 403);
    }

    // プラン制限確認
    const limitCheck = await base44.asServiceRole.functions.invoke("checkExecutiveAvatarUsageLimit", {
      clientCompanyId,
      usageType: "recorded_avatar_video",
      requestedUnits: 60, // 想定値：60秒
      unitName: "seconds",
    });

    if (!limitCheck.allowed) {
      return jsonError("usage_limit_exceeded", limitCheck.message || "利用上限を超過しました。", 429, limitCheck);
    }

    // プロファイル確認
    const profile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.get(avatarProfileId);
    if (!profile) {
      return jsonError("avatar_not_found", "ExecutiveAvatarProfile が見つかりません。", 404);
    }

    // アバターのテナント整合確認（avatarProfileId 経由のクロステナント防止）
    if (!isGlobalAdmin(user) && String(profile.clientCompanyId || "") !== String(clientCompanyId)) {
      return jsonError("tenant_mismatch", "このアバターは別の会社に属しています。", 403);
    }

    // 同意チェック（監査で欠落を指摘された箇所）
    if (profile.consentStatus !== "approved") {
      return jsonError(
        "consent_not_approved",
        "本人同意（consentStatus = approved）が承認されていません。録画動画を生成できません。",
        403
      );
    }

    if (profile.status !== "active") {
      return jsonError("avatar_not_active", "アバターがアクティブになっていません。", 400);
    }

    // 既存のVideoProject機能へ誘導
    // Lightプランでは禁止
    const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
    if (!company) {
      return jsonError("company_not_found", "ClientCompany が見つかりません。", 404);
    }
    if (company?.planName === "Light") {
      return jsonError(
        "plan_not_allowed",
        "録画型アバター動画生成はLightプランでは利用できません。Standard以上へのアップグレードをお願いします。",
        403,
        { planName: "Light" }
      );
    }

    // VideoProject 作成
    const videoProject = await base44.asServiceRole.entities.VideoProject.create({
      clientCompanyId,
      title: `${profile.avatarName} - ${purpose}`,
      purpose: "other",
      script,
      scriptStatus: "approved",
      status: "script_ready",
      voiceMode: "heygen_voice",
      ttsVoice: profile.heygenVoiceId || "default",
      metadata: JSON.stringify({
        avatarProfileId,
        mode,
        createdBy: user.id,
      }),
    });

    // UsageRecord に記録
    await base44.asServiceRole.entities.UsageRecord.create({
      clientCompanyId,
      usageType: "recorded_avatar_video",
      provider: "heygen",
      units: 60, // 初期値
      unitName: "seconds",
      estimatedCostUsd: 0,
      metadata: JSON.stringify({
        videoProjectId: videoProject.id,
        avatarProfileId,
        purpose,
      }),
    });

    return Response.json({
      success: true,
      videoProject,
      message: "ExecutiveAvatar動画プロジェクトが作成されました。ScriptGenerator の AudioGenerator で音声を生成し、VideoUploader で動画化してください。",
    });
  } catch (error) {
    console.error("[createRecordedExecutiveAvatarVideo] Unexpected error:", error?.message, error?.stack);
    return jsonError("unexpected_error", error?.message || "Unexpected error", 500, { stack: error?.stack || null });
  }
});
