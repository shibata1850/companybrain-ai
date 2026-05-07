import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientCompanyId, avatarProfileId, purpose, scenarioId, mode = "FULL" } = await req.json();

    // プラン制限確認
    const limitCheck = await base44.asServiceRole.functions.invoke("checkExecutiveAvatarUsageLimit", {
      clientCompanyId,
      usageType: "live_avatar_session",
      requestedUnits: 1,
      unitName: "session",
    });

    if (!limitCheck.allowed) {
      return Response.json({
        error: "Usage limit exceeded",
        message: limitCheck.message,
      }, { status: 429 });
    }

    // プロファイル取得
    const profile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.get(avatarProfileId);
    if (!profile) {
      return Response.json({ error: "ExecutiveAvatarProfile not found" }, { status: 404 });
    }

    if (profile.consentStatus !== "approved") {
      return Response.json({
        error: "Consent required",
        message: "consentStatus = approved である必要があります。",
      }, { status: 403 });
    }

    if (profile.status !== "active") {
      return Response.json({
        error: "Avatar not active",
        message: "アバターがまだアクティブになっていません。registerAvatarProviderIds で ID を登録してください。",
      }, { status: 400 });
    }

    // 必須ID確認
    if (!profile.liveAvatarAvatarId || !profile.liveAvatarVoiceId || !profile.liveAvatarContextId) {
      return Response.json({
        error: "Missing avatar IDs",
        message: "LiveAvatar Avatar ID, Voice ID, Context ID が揃っていません。",
      }, { status: 400 });
    }

    const liveAvatarKey = Deno.env.get("LIVEAVATAR_API_KEY");
    const heygenKey = Deno.env.get("HEYGEN_API_KEY");

    // LiveAvatar セッション作成試行
    let sessionData = null;
    let provider = null;

    if (liveAvatarKey) {
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
        } else if (laRes.status === 401 || laRes.status === 403) {
          // 認証失敗：HeyGenフォールバック または TEXT_FALLBACK
          provider = "text_fallback";
        }
      } catch (_e) {
        provider = "text_fallback";
      }
    } else if (heygenKey) {
      // LiveAvatar未設定の場合もフォールバック
      provider = "text_fallback";
    } else {
      return Response.json({
        error: "No API configured",
        message: "LiveAvatar または HeyGen API キーが設定されていません。",
      }, { status: 500 });
    }

    // フォールバック: TEXT_FALLBACK モード（Gemini + CompanyBrain RAG）
    if (!sessionData || provider === "text_fallback") {
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

      return Response.json({
        success: true,
        session,
        message: "リアルタイムアバター接続は未設定です。テキスト相談モードで起動しました。",
        fallback: true,
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});