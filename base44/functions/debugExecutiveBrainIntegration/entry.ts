import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientCompanyId, avatarProfileId } = await req.json();

    const loggedIn = true;
    const userRole = user.role || "user";
    const businessRole = user.businessRole || (userRole === "admin" ? "softdoing_admin" : "viewer");

    // 会社確認
    let clientCompanyFound = false;
    let avatarProfileFound = false;
    let consentStatus = null;
    let avatarStatus = null;

    if (clientCompanyId) {
      const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
      clientCompanyFound = !!company;

      if (avatarProfileId) {
        const profile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.get(avatarProfileId);
        avatarProfileFound = !!profile;
        if (profile) {
          consentStatus = profile.consentStatus;
          avatarStatus = profile.status;
        }
      }
    }

    // APIキー確認
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
    const heygenKey = Deno.env.get("HEYGEN_API_KEY");
    const liveAvatarKey = Deno.env.get("LIVEAVATAR_API_KEY");

    const hasGeminiKey = !!geminiKey;
    const hasHeygenKey = !!heygenKey;
    const hasLiveAvatarKey = !!liveAvatarKey;

    // LiveAvatar IDチェック
    let liveAvatarAvatarIdExists = false;
    let liveAvatarVoiceIdExists = false;
    let liveAvatarContextIdExists = false;

    if (avatarProfileFound && avatarProfileId) {
      const profile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.get(avatarProfileId);
      liveAvatarAvatarIdExists = !!profile?.liveAvatarAvatarId;
      liveAvatarVoiceIdExists = !!profile?.liveAvatarVoiceId;
      liveAvatarContextIdExists = !!profile?.liveAvatarContextId;
    }

    // 簡易テスト
    let geminiTestOk = false;
    let heygenTestOk = false;
    let liveAvatarTestOk = false;

    if (hasGeminiKey) {
      try {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiKey, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "test" }] }],
          }),
        });
        geminiTestOk = res.ok || res.status === 400; // 400でも接続OK
      } catch (_e) {
        geminiTestOk = false;
      }
    }

    if (hasHeygenKey) {
      try {
        const res = await fetch("https://api.heygen.com/v1/avatars", {
          headers: { "X-Api-Key": heygenKey },
        });
        heygenTestOk = res.ok;
      } catch (_e) {
        heygenTestOk = false;
      }
    }

    if (hasLiveAvatarKey) {
      try {
        const res = await fetch("https://api.liveavatar.com/health", {
          headers: { "X-API-KEY": liveAvatarKey },
        });
        liveAvatarTestOk = res.ok;
      } catch (_e) {
        liveAvatarTestOk = false;
      }
    }

    return Response.json({
      loggedIn,
      userRole,
      businessRole,
      userClientCompanyId: user.clientCompanyId || null,
      hasGeminiKey,
      geminiModel: hasGeminiKey ? geminiModel : null,
      hasHeygenKey,
      hasLiveAvatarKey,
      clientCompanyFound,
      avatarProfileFound,
      consentStatus,
      avatarStatus,
      liveAvatarAvatarIdExists,
      liveAvatarVoiceIdExists,
      liveAvatarContextIdExists,
      geminiTestOk,
      heygenTestOk,
      liveAvatarTestOk,
      message: "Diagnostics completed",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});