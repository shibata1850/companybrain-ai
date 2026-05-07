import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const PLAN_LIMITS = {
  Light: {
    ai_answer: { monthlyLimit: 1000, unitName: "回答" },
    script_generation: { monthlyLimit: null, unitName: "回" },
    tts: { monthlyLimit: null, unitName: "秒" },
    lipsync: { monthlyLimit: 0, unitName: "秒" },
    file_upload: { monthlyLimit: 50, unitName: "ファイル" },
  },
  Standard: {
    ai_answer: { monthlyLimit: 5000, unitName: "回答" },
    script_generation: { monthlyLimit: 20, unitName: "回" },
    tts: { monthlyLimit: 3000, unitName: "秒" },
    lipsync: { monthlyLimit: 600, unitName: "秒" },
    file_upload: { monthlyLimit: 200, unitName: "ファイル" },
  },
  Professional: {
    ai_answer: { monthlyLimit: 20000, unitName: "回答" },
    script_generation: { monthlyLimit: 50, unitName: "回" },
    tts: { monthlyLimit: 10000, unitName: "秒" },
    lipsync: { monthlyLimit: 1800, unitName: "秒" },
    file_upload: { monthlyLimit: 500, unitName: "ファイル" },
  },
  Enterprise: {
    ai_answer: { monthlyLimit: null, unitName: "回答" },
    script_generation: { monthlyLimit: null, unitName: "回" },
    tts: { monthlyLimit: null, unitName: "秒" },
    lipsync: { monthlyLimit: null, unitName: "秒" },
    file_upload: { monthlyLimit: null, unitName: "ファイル" },
  },
};

function json(data, status = 200) {
  return Response.json(data, { status });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { clientCompanyId, usageType, requestedUnits = 1 } = await req.json();

    if (!clientCompanyId) {
      return json({ error: "clientCompanyId is required" }, 400);
    }

    if (!usageType) {
      return json({ error: "usageType is required" }, 400);
    }

    // ClientCompany を取得
    const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
    if (!company) {
      return json({ error: "ClientCompany not found" }, 404);
    }

    const planName = company.planName || "Light";
    const planConfig = PLAN_LIMITS[planName] || PLAN_LIMITS.Light;
    const limitConfig = planConfig[usageType];

    if (!limitConfig) {
      return json({ error: `Invalid usageType: ${usageType}` }, 400);
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyLimit = limitConfig.monthlyLimit;
    const unitName = limitConfig.unitName;

    // 今月の利用量を集計
    let currentUsage = 0;

    if (usageType === "ai_answer") {
      // ConversationLog の件数をカウント
      const conversations = await base44.asServiceRole.entities.ConversationLog.filter({
        clientCompanyId,
      }).then(c => c.filter(x => x.created_date?.startsWith(currentMonth)));
      currentUsage = conversations.length;

    } else if (usageType === "script_generation") {
      // VideoProject の script_generation 用途のものをカウント
      const projects = await base44.asServiceRole.entities.VideoProject.filter({
        clientCompanyId,
      }).then(p => p.filter(x => x.created_date?.startsWith(currentMonth) && x.scriptStatus === "approved"));
      currentUsage = projects.length;

    } else if (usageType === "tts") {
      // UsageRecord から tts の秒数を集計
      const records = await base44.asServiceRole.entities.UsageRecord.filter({
        clientCompanyId,
        usageType: "tts",
      }).then(r => r.filter(x => x.created_date?.startsWith(currentMonth)));
      currentUsage = records.reduce((sum, r) => sum + (r.units || 0), 0);

    } else if (usageType === "lipsync") {
      // VideoProject の lipsync 用途のものをカウント（durationSeconds）
      const projects = await base44.asServiceRole.entities.VideoProject.filter({
        clientCompanyId,
      }).then(p => p.filter(x => x.created_date?.startsWith(currentMonth) && x.status === "completed"));
      currentUsage = projects.reduce((sum, p) => sum + (p.durationSeconds || 0), 0);

    } else if (usageType === "file_upload") {
      // KnowledgeSource の件数をカウント
      const sources = await base44.asServiceRole.entities.KnowledgeSource.filter({
        clientCompanyId,
      }).then(s => s.filter(x => x.created_date?.startsWith(currentMonth)));
      currentUsage = sources.length;
    }

    // 上限のないプラン（Enterprise）の場合
    const isEnterprise = planName === "Enterprise";
    const isUnlimited = monthlyLimit === null;
    const isSoftdoingAdmin = user.role === "admin" || user.businessRole === "softdoing_admin";

    let allowed = true;
    let warning = false;
    let message = "";
    let remaining = null;

    if (isUnlimited) {
      allowed = true;
      warning = isEnterprise ? true : false; // Enterprise なら warning=true だが実行可能
      message = isEnterprise ? `Enterprise プランのため上限なし。（${currentUsage}${unitName}使用中）` : `無制限の利用が可能です。`;
    } else {
      const newUsage = currentUsage + requestedUnits;
      remaining = monthlyLimit - currentUsage;

      // Lightプランで lipsync=0 の場合（ブロック）
      if (planName === "Light" && usageType === "lipsync" && monthlyLimit === 0) {
        if (!isSoftdoingAdmin) {
          allowed = false;
          message = `${planName}プランではこの機能は利用できません。`;
        } else {
          // softdoing_admin はテストのため実行可能だが警告
          allowed = true;
          warning = true;
          message = `[テストモード] ${planName}プランでは通常この機能は利用できません。（${currentUsage}${unitName}使用中）`;
        }
      } else if (newUsage > monthlyLimit) {
        // 上限超過
        if (!isSoftdoingAdmin) {
          allowed = false;
          message = `月間${usageType}の上限（${monthlyLimit}${unitName}）を超過しています。現在: ${currentUsage}${unitName}、要求: ${requestedUnits}${unitName}`;
        } else {
          // softdoing_admin はテストのため実行可能だが警告
          allowed = true;
          warning = true;
          message = `[テストモード] 月間${usageType}の上限（${monthlyLimit}${unitName}）を超過しています。現在: ${currentUsage}${unitName}、要求: ${requestedUnits}${unitName}`;
        }
      } else if (currentUsage >= monthlyLimit * 0.8) {
        // 80% 以上使用
        allowed = true;
        warning = true;
        message = `月間${usageType}使用量が上限の80%に達しています。（${currentUsage}/${monthlyLimit}${unitName}）`;
      } else {
        allowed = true;
        warning = false;
        message = `${currentUsage}/${monthlyLimit}${unitName}使用中`;
      }
    }

    return json({
      allowed,
      warning,
      planName,
      usageType,
      currentUsage,
      limit: monthlyLimit,
      remaining: isUnlimited ? null : remaining,
      message,
      requestedUnits,
      isTestMode: isSoftdoingAdmin && warning,
    });

  } catch (error) {
    console.error("[checkUsageLimit] Error:", error?.message);
    return json({
      error: error?.message || "Internal error",
      stack: error?.stack || null,
    }, 500);
  }
});