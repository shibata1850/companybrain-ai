import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientCompanyId, avatarProfileId, creationMode } = await req.json();

    // 基本チェック
    const profile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.get(avatarProfileId);
    if (!profile) {
      return Response.json({ error: "ExecutiveAvatarProfile not found" }, { status: 404 });
    }

    if (profile.consentStatus !== "approved") {
      return Response.json({
        error: "Consent required",
        message: "本人同意（consentStatus = approved）が必要です。",
      }, { status: 403 });
    }

    if (creationMode === "heygen_digital_twin_api" || creationMode === "manual_id_registration") {
      if (!profile.sourceVideoUri && !profile.sourceAudioUri) {
        return Response.json({
          error: "Source material required",
          message: "sourceVideoUri または sourceAudioUri を設定してください。",
        }, { status: 400 });
      }
    }

    // HeyGen キー確認（manual_id_registration除外）
    if (creationMode !== "manual_id_registration") {
      const heygenKey = Deno.env.get("HEYGEN_API_KEY");
      if (!heygenKey) {
        return Response.json({
          error: "HeyGen API key not configured",
          message: "HeyGen APIキーが設定されていません。",
        }, { status: 500 });
      }
    }

    let creationJob;

    if (creationMode === "heygen_digital_twin_api") {
      // HeyGen Digital Twin Creation API呼び出し試行
      const heygenKey = Deno.env.get("HEYGEN_API_KEY");
      
      try {
        const heygenRes = await fetch("https://api.heygen.com/v1/digital_twins", {
          method: "POST",
          headers: {
            "X-Api-Key": heygenKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            video_url: profile.sourceVideoUri,
            name: profile.avatarName,
          }),
        });

        if (heygenRes.ok) {
          const data = await heygenRes.json();
          const jobId = data.avatar_id || data.id;

          creationJob = await base44.asServiceRole.entities.AvatarCreationJob.create({
            clientCompanyId,
            avatarProfileId,
            creationMode,
            jobId,
            status: "processing",
            progress: 0,
          });

          return Response.json({
            success: true,
            creationJob,
            message: "HeyGen Digital Twin作成がスタートしました。進捗はdebugExecutiveBrainIntegrationで確認できます。",
          });
        } else {
          // API未対応の場合は manual_required へ
          creationJob = await base44.asServiceRole.entities.AvatarCreationJob.create({
            clientCompanyId,
            avatarProfileId,
            creationMode,
            status: "manual_required",
            errorMessage: "HeyGen Digital Twin APIが利用不可。HeyGen管理画面で作成してください。",
          });

          await base44.asServiceRole.entities.ExecutiveAvatarProfile.update(avatarProfileId, {
            status: "manual_id_required",
          });

          return Response.json({
            success: false,
            creationJob,
            message: "HeyGen Digital Twin APIが現在利用不可です。HeyGen管理画面でDigital Twinアバターを作成し、avatar_id と voice_id を registerAvatarProviderIds で登録してください。",
          });
        }
      } catch (error) {
        creationJob = await base44.asServiceRole.entities.AvatarCreationJob.create({
          clientCompanyId,
          avatarProfileId,
          creationMode,
          status: "manual_required",
          errorMessage: error.message,
        });

        await base44.asServiceRole.entities.ExecutiveAvatarProfile.update(avatarProfileId, {
          status: "manual_id_required",
        });

        return Response.json({
          success: false,
          creationJob,
          message: "HeyGen API呼び出し時にエラーが発生しました。HeyGen管理画面で作成したavatar_idとvoice_idを registerAvatarProviderIds で登録してください。",
        });
      }
    } else if (creationMode === "manual_id_registration") {
      creationJob = await base44.asServiceRole.entities.AvatarCreationJob.create({
        clientCompanyId,
        avatarProfileId,
        creationMode,
        status: "manual_required",
      });

      await base44.asServiceRole.entities.ExecutiveAvatarProfile.update(avatarProfileId, {
        status: "manual_id_required",
      });

      return Response.json({
        success: true,
        creationJob,
        message: "HeyGen / LiveAvatar管理画面でavatar_idとvoice_idを作成し、registerAvatarProviderIds エンドポイントで登録してください。",
      });
    } else if (creationMode === "recorded_lipsync_only") {
      return Response.json({
        success: true,
        message: "既存のHeyGen Lipsync機能（VideoProject）を使用してください。ScriptGenerator -> AudioGenerator -> VideoUploader の流れで動画を生成できます。",
      });
    }

    return Response.json({ error: "Invalid creation mode" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});