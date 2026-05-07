import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

function logDebug(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const safe = { ...context };
  delete safe.apiKey;
  delete safe.secretKey;
  console.log(`[${level}] ${message}`, JSON.stringify(safe));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    logDebug("INFO", "debugExecutiveBrainIntegration started", {
      userId: user.id,
      businessRole: user.businessRole,
      userRole: user.role,
    });

    const { clientCompanyId } = await req.json();

    const userRole = user.role || "user";
    const businessRole = user.businessRole || (userRole === "admin" ? "softdoing_admin" : "viewer");

    // APIキー確認
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
    const heygenKey = Deno.env.get("HEYGEN_API_KEY");
    const liveAvatarKey = Deno.env.get("LIVEAVATAR_API_KEY");

    const hasGeminiKey = !!geminiKey;
    const hasHeygenKey = !!heygenKey;
    const hasLiveAvatarKey = !!liveAvatarKey;

    logDebug("DEBUG", "API key status", {
      hasGeminiKey,
      hasHeygenKey,
      hasLiveAvatarKey,
    });

    // 会社確認
    let company = null;
    let companyExists = false;
    let companyName = null;

    if (clientCompanyId) {
      company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
      companyExists = !!company;
      companyName = company?.companyName || null;
      logDebug("DEBUG", "Company check", { clientCompanyId, companyExists });
    }

    // 最初のアバタープロファイル取得
    let avatar = null;
    let avatarExists = false;
    let avatarName = null;
    let consentStatus = null;
    let avatarStatus = null;
    let hasHeygenAvatarId = false;
    let hasHeygenVoiceId = false;
    let hasLiveAvatarAvatarId = false;
    let hasLiveAvatarVoiceId = false;
    let hasLiveAvatarContextId = false;

    if (companyExists) {
      const avatars = await base44.asServiceRole.entities.ExecutiveAvatarProfile.filter({
        clientCompanyId,
      });
      if (avatars.length > 0) {
        avatar = avatars[0];
        avatarExists = true;
        avatarName = avatar.avatarName;
        consentStatus = avatar.consentStatus;
        avatarStatus = avatar.status;
        hasHeygenAvatarId = !!avatar.heygenAvatarId;
        hasHeygenVoiceId = !!avatar.heygenVoiceId;
        hasLiveAvatarAvatarId = !!avatar.liveAvatarAvatarId;
        hasLiveAvatarVoiceId = !!avatar.liveAvatarVoiceId;
        hasLiveAvatarContextId = !!avatar.liveAvatarContextId;

        logDebug("DEBUG", "Avatar check", {
          avatarExists,
          avatarName,
          consentStatus,
          avatarStatus,
          hasHeygenAvatarId,
          hasLiveAvatarContextId,
        });
      }
    }

    // 接続テスト
    let geminiConnected = false;
    let geminiStatusCode = null;
    let heygenConnected = false;
    let heygenStatusCode = null;
    let liveAvatarConnected = false;
    let liveAvatarStatusCode = null;

    if (hasGeminiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: "test" }] }],
            }),
          }
        );
        geminiConnected = res.ok || res.status === 400;
        geminiStatusCode = res.status;
        logDebug("DEBUG", "Gemini API test", {
          connected: geminiConnected,
          status: geminiStatusCode,
        });
      } catch (e) {
        logDebug("WARN", "Gemini API test failed", { error: e.message });
        geminiConnected = false;
      }
    }

    if (hasHeygenKey) {
      try {
        const res = await fetch("https://api.heygen.com/v1/avatars", {
          headers: { "X-Api-Key": heygenKey },
        });
        heygenConnected = res.ok;
        heygenStatusCode = res.status;
        logDebug("DEBUG", "HeyGen API test", {
          connected: heygenConnected,
          status: heygenStatusCode,
        });
      } catch (e) {
        logDebug("WARN", "HeyGen API test failed", { error: e.message });
        heygenConnected = false;
      }
    }

    if (hasLiveAvatarKey) {
      try {
        const res = await fetch("https://api.liveavatar.com/health", {
          headers: { "X-API-KEY": liveAvatarKey },
        });
        liveAvatarConnected = res.ok;
        liveAvatarStatusCode = res.status;
        logDebug("DEBUG", "LiveAvatar API test", {
          connected: liveAvatarConnected,
          status: liveAvatarStatusCode,
        });
      } catch (e) {
        logDebug("WARN", "LiveAvatar API test failed", { error: e.message });
        liveAvatarConnected = false;
      }
    }

    // 推奨アクション
    let recommendedAction = null;
    if (!hasGeminiKey) {
      recommendedAction = "missing_gemini_key";
    } else if (!hasHeygenKey) {
      recommendedAction = "missing_heygen_key";
    } else if (!companyExists) {
      recommendedAction = "company_not_found";
    } else if (!avatarExists) {
      recommendedAction = "avatar_not_found";
    } else if (consentStatus !== "approved") {
      recommendedAction = "consent_not_approved";
    } else if (avatarStatus !== "active") {
      recommendedAction = "avatar_not_active";
    } else if (!hasHeygenAvatarId && !hasLiveAvatarAvatarId) {
      recommendedAction = "missing_avatar_ids";
    }

    logDebug("INFO", "Diagnostics completed", {
      userId: user.id,
      businessRole,
      clientCompanyId,
      companyExists,
      avatarExists,
      avatarStatus,
      consentStatus,
      recommendedAction,
      hasGeminiKey,
      hasHeygenKey,
      hasLiveAvatarKey,
      geminiConnected,
      heygenConnected,
      liveAvatarConnected,
    });

    return Response.json({
      userId: user.id,
      businessRole,
      userRole,
      hasGeminiKey,
      geminiModel: hasGeminiKey ? geminiModel : null,
      hasHeygenKey,
      hasLiveAvatarKey,
      geminiConnected,
      geminiStatusCode,
      heygenConnected,
      heygenStatusCode,
      liveAvatarConnected,
      liveAvatarStatusCode,
      companyExists,
      companyName,
      avatarExists,
      avatarName,
      consentStatus,
      avatarStatus,
      hasHeygenAvatarId,
      hasHeygenVoiceId,
      hasLiveAvatarAvatarId,
      hasLiveAvatarVoiceId,
      hasLiveAvatarContextId,
      recommendedAction,
    });
  } catch (error) {
    logDebug("ERROR", "Unexpected error", { message: error.message });
    return Response.json({
      error: error.message,
      errorType: "unexpected_error",
    }, { status: 500 });
  }
});