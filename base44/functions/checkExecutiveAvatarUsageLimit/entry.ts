import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientCompanyId, usageType, requestedUnits, unitName } = await req.json();

    if (!clientCompanyId || !usageType) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
    if (!company) {
      return Response.json({ error: "ClientCompany not found" }, { status: 404 });
    }

    const planName = company.planName || "Light";

    // プランルール定義
    const PLAN_CONFIG = {
      Light: {
        executiveAvatarEnabled: false,
        liveAvatarSecondsMonthly: 0,
        recordedAvatarVideoSecondsMonthly: 0,
      },
      Standard: {
        executiveAvatarEnabled: false,
        liveAvatarSecondsMonthly: 0,
        recordedAvatarVideoSecondsMonthly: 600,
      },
      Professional: {
        executiveAvatarEnabled: true,
        avatarProfileLimit: 1,
        liveAvatarSecondsMonthly: 7200,
        recordedAvatarVideoSecondsMonthly: 1800,
        workReviewLimitMonthly: 300,
        trainingSessionLimitMonthly: 100,
      },
      Enterprise: {
        executiveAvatarEnabled: true,
        avatarProfileLimit: null,
        liveAvatarSecondsMonthly: null,
        recordedAvatarVideoSecondsMonthly: null,
        workReviewLimitMonthly: null,
        trainingSessionLimitMonthly: null,
      },
    };

    const config = PLAN_CONFIG[planName] || PLAN_CONFIG.Light;
    const isSoftdoingAdmin = user.role === "admin" || user.businessRole === "softdoing_admin";

    // 機能有効化チェック
    if (!config.executiveAvatarEnabled && usageType.includes("live_avatar")) {
      if (!isSoftdoingAdmin) {
        return Response.json({
          allowed: false,
          warning: null,
          planName,
          currentUsage: 0,
          limit: 0,
          remaining: 0,
          message: `ExecutiveBrain Avatar機能は${planName}プランでは利用できません。Professional以上へのアップグレードをお願いします。`,
        });
      }
    }

    if (config.recordedAvatarVideoSecondsMonthly === 0 && usageType === "recorded_avatar_video") {
      if (!isSoftdoingAdmin) {
        return Response.json({
          allowed: false,
          warning: null,
          planName,
          currentUsage: 0,
          limit: 0,
          remaining: 0,
          message: `録画型アバター動画生成は${planName}プランでは利用できません。Standard以上へのアップグレードをお願いします。`,
        });
      }
    }

    // 月間使用量を集計
    const currentMonth = new Date().toISOString().slice(0, 7);
    let currentUsage = 0;
    let limit = null;
    let warning = null;

    if (usageType === "live_avatar_session") {
      const records = await base44.asServiceRole.entities.UsageRecord.filter({
        clientCompanyId,
        usageType: "live_avatar_session",
      }).then(r => r.filter(x => x.created_date?.startsWith(currentMonth)));
      currentUsage = records.reduce((sum, r) => sum + (r.units || 0), 0);
      limit = config.liveAvatarSecondsMonthly;
    } else if (usageType === "recorded_avatar_video") {
      const records = await base44.asServiceRole.entities.UsageRecord.filter({
        clientCompanyId,
        usageType: "recorded_avatar_video",
      }).then(r => r.filter(x => x.created_date?.startsWith(currentMonth)));
      currentUsage = records.reduce((sum, r) => sum + (r.units || 0), 0);
      limit = config.recordedAvatarVideoSecondsMonthly;
    } else if (usageType === "avatar_work_review") {
      const records = await base44.asServiceRole.entities.WorkReviewRequest.filter({
        clientCompanyId,
      }).then(r => r.filter(x => x.created_date?.startsWith(currentMonth)));
      currentUsage = records.length;
      limit = config.workReviewLimitMonthly;
    } else if (usageType === "avatar_training") {
      const records = await base44.asServiceRole.entities.AvatarConversationSession.filter({
        clientCompanyId,
        purpose: "training",
      }).then(r => r.filter(x => x.created_date?.startsWith(currentMonth)));
      currentUsage = records.length;
      limit = config.trainingSessionLimitMonthly;
    }

    const remaining = limit !== null ? Math.max(0, limit - currentUsage) : null;
    const allowed = limit === null || (currentUsage + (requestedUnits || 0) <= limit);

    if (isSoftdoingAdmin && !allowed) {
      warning = `[管理者テスト] 上限超過ですが、softdoing_adminとして許可します。`;
    }

    return Response.json({
      allowed: isSoftdoingAdmin || allowed,
      warning,
      planName,
      currentUsage,
      limit,
      remaining,
      message: allowed
        ? "利用可能です"
        : `月間上限（${limit}）に達しています。（現在: ${currentUsage}）`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});