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
      avatarProfileId,
      heygenAvatarId,
      heygenVoiceId,
      liveAvatarAvatarId,
      liveAvatarVoiceId,
      liveAvatarContextId,
      liveAvatarLlmConfigurationId,
    } = await req.json();

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

    // 更新用データ構築
    const updateData = {};
    if (heygenAvatarId) updateData.heygenAvatarId = heygenAvatarId;
    if (heygenVoiceId) updateData.heygenVoiceId = heygenVoiceId;
    if (liveAvatarAvatarId) updateData.liveAvatarAvatarId = liveAvatarAvatarId;
    if (liveAvatarVoiceId) updateData.liveAvatarVoiceId = liveAvatarVoiceId;
    if (liveAvatarContextId) updateData.liveAvatarContextId = liveAvatarContextId;
    if (liveAvatarLlmConfigurationId) updateData.liveAvatarLlmConfigurationId = liveAvatarLlmConfigurationId;

    if (Object.keys(updateData).length === 0) {
      return Response.json({
        error: "No IDs provided",
        message: "少なくとも1つのIDを指定してください。",
      }, { status: 400 });
    }

    // 必須IDチェック（どのプロバイダを使うかで異なる）
    const hasHeygenIds = heygenAvatarId && heygenVoiceId;
    const hasLiveAvatarIds = liveAvatarAvatarId && liveAvatarVoiceId;

    // ステータス判定：どちらか一方でも揃っていれば active へ
    const allRequiredFilled = hasHeygenIds || hasLiveAvatarIds;
    if (allRequiredFilled) {
      updateData.status = "active";
    }

    // 保存
    const updated = await base44.asServiceRole.entities.ExecutiveAvatarProfile.update(
      avatarProfileId,
      updateData
    );

    return Response.json({
      success: true,
      avatarProfile: updated,
      message: updated.status === "active"
        ? "アバターIDが登録されました。ExecutiveBrain Avatarが利用可能です。"
        : "IDが部分的に登録されました。すべての必須IDを登録するとアバターが有効になります。",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});