import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientCompanyId, avatarProfileId, script, purpose, mode = "heygen_avatar_video" } = await req.json();

    // プラン制限確認
    const limitCheck = await base44.asServiceRole.functions.invoke("checkExecutiveAvatarUsageLimit", {
      clientCompanyId,
      usageType: "recorded_avatar_video",
      requestedUnits: 60, // 想定値：60秒
      unitName: "seconds",
    });

    if (!limitCheck.allowed) {
      return Response.json({
        error: "Feature not available",
        message: limitCheck.message,
      }, { status: 429 });
    }

    // プロファイル確認
    const profile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.get(avatarProfileId);
    if (!profile) {
      return Response.json({ error: "ExecutiveAvatarProfile not found" }, { status: 404 });
    }

    if (profile.status !== "active") {
      return Response.json({
        error: "Avatar not active",
        message: "アバターがアクティブになっていません。",
      }, { status: 400 });
    }

    // 既存のVideoProject機能へ誘導
    // Lightプランでは禁止
    const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
    if (company?.planName === "Light") {
      return Response.json({
        error: "Feature not available",
        message: "録画型アバター動画生成はLightプランでは利用できません。Standard以上へのアップグレードをお願いします。",
      }, { status: 403 });
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});