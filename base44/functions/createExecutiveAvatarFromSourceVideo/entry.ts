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

    const { clientCompanyId, avatarProfileId, creationMode } = await req.json();

    if (!clientCompanyId) return jsonError("invalid_request", "clientCompanyId is required", 400);
    if (!avatarProfileId) return jsonError("invalid_request", "avatarProfileId is required", 400);

    // テナント分離: asServiceRole を使う前に必ずチェック
    const tenant = assertTenantAccess(user, clientCompanyId);
    if (!tenant.allowed) {
      return jsonError(tenant.errorType, tenant.message, 403);
    }

    // 基本チェック
    const profile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.get(avatarProfileId);
    if (!profile) {
      return jsonError("avatar_not_found", "ExecutiveAvatarProfile が見つかりません。", 404);
    }

    // アバターのテナント整合確認（avatarProfileId 経由のクロステナント防止）
    if (!isGlobalAdmin(user) && String(profile.clientCompanyId || "") !== String(clientCompanyId)) {
      return jsonError("tenant_mismatch", "このアバターは別の会社に属しています。", 403);
    }

    if (profile.consentStatus !== "approved") {
      return jsonError(
        "consent_not_approved",
        "本人同意（consentStatus = approved）が必要です。",
        403
      );
    }

    if (creationMode === "heygen_digital_twin_api" || creationMode === "manual_id_registration") {
      if (!profile.sourceVideoUri && !profile.sourceAudioUri) {
        return jsonError(
          "source_material_required",
          "sourceVideoUri または sourceAudioUri を設定してください。",
          400
        );
      }
    }

    // HeyGen キー確認（manual_id_registration除外）
    if (creationMode !== "manual_id_registration") {
      const heygenKey = Deno.env.get("HEYGEN_API_KEY");
      if (!heygenKey) {
        return jsonError(
          "missing_heygen_key",
          "HeyGen APIキーが設定されていません。",
          500
        );
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

    return jsonError("invalid_creation_mode", "Invalid creation mode", 400);
  } catch (error) {
    console.error("[createExecutiveAvatarFromSourceVideo] Unexpected error:", error?.message, error?.stack);
    return jsonError("unexpected_error", error?.message || "Unexpected error", 500, { stack: error?.stack || null });
  }
});
