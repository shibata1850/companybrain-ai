import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

function logDebug(level, message, context = {}) {
  const safe = { ...context };
  delete safe.token;
  delete safe.apiKey;
  delete safe.secretKey;
  console.log(`[${level}] ${message}`, JSON.stringify(safe));
}

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

    logDebug("INFO", "startExecutiveAvatarSession started", {
      userId: user.id,
    });

    const { clientCompanyId, avatarProfileId, purpose, scenarioId, mode = "FULL" } = await req.json();

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
      usageType: "live_avatar_session",
      requestedUnits: 1,
      unitName: "session",
    });

    if (!limitCheck.allowed) {
      return jsonError("usage_limit_exceeded", limitCheck.message || "利用上限を超過しました。", 429, limitCheck);
    }

    // プロファイル取得
    const profile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.get(avatarProfileId);
    if (!profile) {
      logDebug("ERROR", "Avatar profile not found", { avatarProfileId });
      return jsonError("avatar_not_found", "ExecutiveAvatarProfile が見つかりません。", 404);
    }

    // アバターのテナント整合確認（avatarProfileId 経由のクロステナント防止）
    if (!isGlobalAdmin(user) && String(profile.clientCompanyId || "") !== String(clientCompanyId)) {
      logDebug("WARN", "Avatar belongs to different tenant", {
        avatarProfileId,
        avatarCompanyId: profile.clientCompanyId,
        requestCompanyId: clientCompanyId,
      });
      return jsonError("tenant_mismatch", "このアバターは別の会社に属しています。", 403);
    }

    logDebug("DEBUG", "Avatar profile loaded", {
      avatarProfileId,
      avatarName: profile.avatarName,
      consentStatus: profile.consentStatus,
      avatarStatus: profile.status,
    });

    if (profile.consentStatus !== "approved") {
      logDebug("WARN", "Consent not approved", { avatarProfileId, consentStatus: profile.consentStatus });
      return jsonError(
        "consent_not_approved",
        "本人同意が承認されていないため、このアバターは利用できません。",
        403
      );
    }

    if (profile.status !== "active") {
      logDebug("WARN", "Avatar not active", { avatarProfileId, avatarStatus: profile.status });
      return jsonError("avatar_not_active", "このアバターは現在有効化されていません。", 400);
    }

    // 必須ID確認
    const hasHeygenIds = !!profile.heygenAvatarId && !!profile.heygenVoiceId;
    const hasLiveAvatarIds = !!profile.liveAvatarAvatarId && !!profile.liveAvatarVoiceId && !!profile.liveAvatarContextId;

    if (!hasHeygenIds && !hasLiveAvatarIds) {
      logDebug("ERROR", "Missing all provider IDs", { avatarProfileId });
      return jsonError(
        "missing_avatar_ids",
        "avatar_id、voice_id、context_id が不足しています。アバターID設定画面で登録してください。",
        400
      );
    }

    const liveAvatarKey = Deno.env.get("LIVEAVATAR_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    // LiveAvatar セッション作成試行
    let sessionData = null;
    let provider = null;
    let fallbackReason = null;

    if (liveAvatarKey && hasLiveAvatarIds) {
      logDebug("DEBUG", "Attempting LiveAvatar session", {
        avatarProfileId,
        avatarId: profile.liveAvatarAvatarId ? "***" : undefined,
      });

      try {
        const laRes = await fetch("https://api.liveavatar.com/sessions", {
          method: "POST",
          headers: {
            "X-API-KEY": liveAvatarKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            avatar_id: profile.liveAvatarAvatarId,
            voice_id: profile.liveAvatarVoiceId,
            context_id: profile.liveAvatarContextId,
            mode,
          }),
        });

        if (laRes.ok) {
          sessionData = await laRes.json();
          provider = "liveavatar";
          logDebug("INFO", "LiveAvatar session created successfully", {
            avatarProfileId,
            sessionId: sessionData.session_id || sessionData.id,
          });
        } else {
          logDebug("WARN", "LiveAvatar session failed", {
            avatarProfileId,
            statusCode: laRes.status,
          });
          fallbackReason = `liveavatar_api_error_${laRes.status}`;
          provider = "text_fallback";
        }
      } catch (e) {
        logDebug("WARN", "LiveAvatar session error", {
          avatarProfileId,
          error: e.message,
        });
        fallbackReason = "liveavatar_connection_failed";
        provider = "text_fallback";
      }
    } else {
      if (!liveAvatarKey) {
        logDebug("DEBUG", "LiveAvatar key not set, using TEXT_FALLBACK", {
          avatarProfileId,
        });
      }
      fallbackReason = "liveavatar_not_configured";
      provider = "text_fallback";
    }

    // Gemini RAG 確認
    if (!geminiKey && provider === "text_fallback") {
      logDebug("ERROR", "No Gemini key for fallback", { avatarProfileId });
      return jsonError(
        "missing_gemini_key",
        "テキストモードに必要な GEMINI_API_KEY が設定されていません。",
        500
      );
    }

    // フォールバック: TEXT_FALLBACK モード（Gemini + CompanyBrain RAG）
    if (provider === "text_fallback") {
      logDebug("INFO", "Creating TEXT_FALLBACK session", {
        avatarProfileId,
        fallbackReason,
      });

      const session = await base44.asServiceRole.entities.AvatarConversationSession.create({
        clientCompanyId,
        avatarProfileId,
        userId: user.id,
        purpose,
        scenario: scenarioId,
        mode: "TEXT_FALLBACK",
        provider: "gemini_text",
        status: "active",
      });

      // UsageRecord に記録
      await base44.asServiceRole.entities.UsageRecord.create({
        clientCompanyId,
        usageType: "avatar_session",
        provider: "gemini_text",
        units: 1,
        unitName: "session",
        estimatedCostUsd: 0,
        metadata: JSON.stringify({
          sessionId: session.id,
          avatarProfileId,
          mode: "TEXT_FALLBACK",
          fallbackReason,
        }),
      });

      return Response.json({
        success: true,
        session: {
          id: session.id,
          mode: session.mode,
          provider: session.provider,
        },
        message: fallbackReason
          ? "リアルタイムアバター接続に失敗しました。テキスト相談モードで起動しました。"
          : "テキスト相談モードで起動しました。",
        fallback: true,
        fallbackReason,
      });
    }

    // LiveAvatar セッション成功
    const session = await base44.asServiceRole.entities.AvatarConversationSession.create({
      clientCompanyId,
      avatarProfileId,
      userId: user.id,
      sessionId: sessionData.session_id || sessionData.id,
      sessionToken: sessionData.session_token || sessionData.token,
      roomUrl: sessionData.room_url,
      embedUrl: sessionData.embed_url,
      purpose,
      scenario: scenarioId,
      mode,
      provider: "liveavatar",
      status: "active",
    });

    // UsageRecord に記録
    await base44.asServiceRole.entities.UsageRecord.create({
      clientCompanyId,
      usageType: "avatar_session",
      provider: "liveavatar",
      units: 1,
      unitName: "session",
      estimatedCostUsd: 0,
      metadata: JSON.stringify({
        sessionId: session.id,
        avatarProfileId,
        mode,
      }),
    });

    logDebug("INFO", "ExecutiveAvatar session started successfully", {
      sessionId: session.id,
      avatarProfileId,
      mode,
    });

    return Response.json({
      success: true,
      session: {
        id: session.id,
        sessionId: session.sessionId,
        sessionToken: session.sessionToken,
        roomUrl: session.roomUrl,
        embedUrl: session.embedUrl,
        mode: session.mode,
        provider: session.provider,
      },
      message: "ExecutiveAvatarセッションが開始されました。",
    });
  } catch (error) {
    logDebug("ERROR", "Unexpected error", {
      error: error.message,
    });
    return jsonError("unexpected_error", error?.message || "Unexpected error", 500, { stack: error?.stack || null });
  }
});
