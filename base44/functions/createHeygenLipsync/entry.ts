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

    const { videoProjectId, mode = "speed" } = await req.json();

    if (!videoProjectId) {
      return jsonError("invalid_request", "videoProjectId is required", 400);
    }

    // VideoProject はテナントを判定するためにまず取得
    const project = await base44.asServiceRole.entities.VideoProject.get(videoProjectId);
    if (!project) {
      return jsonError("video_project_not_found", "VideoProject が見つかりません。", 404);
    }

    // テナント分離: project.clientCompanyId と user.clientCompanyId を照合
    const tenant = assertTenantAccess(user, project.clientCompanyId);
    if (!tenant.allowed) {
      return jsonError(tenant.errorType, tenant.message, 403);
    }

    if (!project.videoFileUri || !project.audioFileUri) {
      return jsonError(
        "missing_media",
        "videoFileUri と audioFileUri の両方が必要です。",
        400
      );
    }

    // 会社情報とプラン取得
    const company = await base44.asServiceRole.entities.ClientCompany.get(project.clientCompanyId);
    const planName = company?.planName || "Light";

    // プラン別リップシンク月間上限
    const PLAN_LIMITS = {
      Light: 0,
      Standard: 600,
      Professional: 1800,
      Enterprise: null,
    };

    const monthlyLimit = PLAN_LIMITS[planName];

    // Lightプランでブロック
    if (monthlyLimit === 0) {
      await base44.asServiceRole.entities.VideoProject.update(videoProjectId, {
        status: "failed",
        errorMessage: "動画生成上限を超過しています",
      });
      return jsonError(
        "plan_not_allowed",
        "リップシンク生成はLightプランでは利用できません。上位プランへのアップグレードをお願いします。",
        403,
        { planName, limitExceeded: true }
      );
    }

    // 当月の使用秒数をカウント
    const currentMonth = new Date().toISOString().slice(0, 7);
    const usageRecords = await base44.asServiceRole.entities.UsageRecord.filter({
      clientCompanyId: project.clientCompanyId,
      usageType: "lipsync",
    }).then(records => records.filter(r => r.created_date?.startsWith(currentMonth)));

    const totalUsedSeconds = usageRecords.reduce((sum, r) => sum + (r.units || 0), 0);
    const requestedSeconds = project.durationSeconds || 0;

    // 上限チェック（Enterpriseは無制限）
    if (monthlyLimit !== null && totalUsedSeconds + requestedSeconds > monthlyLimit) {
      await base44.asServiceRole.entities.VideoProject.update(videoProjectId, {
        status: "failed",
        errorMessage: "動画生成上限を超過しています",
      });
      return jsonError(
        "usage_limit_exceeded",
        `月間リップシンク生成上限（${monthlyLimit}秒）を超過します。`,
        429,
        { planName, used: totalUsedSeconds, requested: requestedSeconds, limit: monthlyLimit }
      );
    }

    const { signed_url: videoUrl } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: project.videoFileUri,
      expires_in: 86400,
    });

    const { signed_url: audioUrl } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: project.audioFileUri,
      expires_in: 86400,
    });

    const heygenApiKey = Deno.env.get("HEYGEN_API_KEY");

    if (!heygenApiKey) {
      return jsonError("missing_heygen_key", "HEYGEN_API_KEY is not set", 500);
    }

    const heygenRes = await fetch("https://api.heygen.com/v3/lipsyncs", {
      method: "POST",
      headers: {
        "X-Api-Key": heygenApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video: { type: "url", url: videoUrl },
        audio: { type: "url", url: audioUrl },
        mode,
        title: project.title || "CompanyBrain AI Lipsync",
        enable_dynamic_duration: true,
        enable_speech_enhancement: true,
      }),
    });

    if (!heygenRes.ok) {
      const errorText = await heygenRes.text();
      await base44.asServiceRole.entities.VideoProject.update(videoProjectId, {
        status: "failed",
        errorMessage: errorText,
      });
      return jsonError("heygen_api_error", "HeyGen APIの呼び出しに失敗しました。", 502, { status: heygenRes.status, detail: errorText });
    }

    const data = await heygenRes.json();
    const jobId = data.lipsync_id || data.id || data.data?.lipsync_id || data.data?.id;

    await base44.asServiceRole.entities.VideoProject.update(videoProjectId, {
      heygenJobId: jobId,
      lipsyncMode: mode,
      status: "processing",
    });

    // UsageRecordに記録（HeyGen APIを呼び出す前に利用制限チェック済み）
    await base44.asServiceRole.entities.UsageRecord.create({
      clientCompanyId: project.clientCompanyId,
      usageType: "lipsync",
      provider: "heygen",
      units: requestedSeconds,
      unitName: "seconds",
      estimatedCostUsd: 0,
      metadata: JSON.stringify({ videoProjectId, mode, jobId }),
    });

    return Response.json({ heygenJobId: jobId, raw: data });
  } catch (error) {
    console.error("[createHeygenLipsync] Unexpected error:", error?.message, error?.stack);
    return jsonError("unexpected_error", error?.message || "Unexpected error", 500, { stack: error?.stack || null });
  }
});
