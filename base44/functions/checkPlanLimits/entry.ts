import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const PLAN_LIMITS = {
  Light: {
    aiAnswerLimitMonthly: 1000,
    knowledgePageLimit: 50,
    videoSecondsLimitMonthly: 0,
    adminUserLimit: 3,
    websiteEmbedLimit: 0,
  },
  Standard: {
    aiAnswerLimitMonthly: 5000,
    knowledgePageLimit: 200,
    videoSecondsLimitMonthly: 600,
    adminUserLimit: 10,
    websiteEmbedLimit: 1,
  },
  Professional: {
    aiAnswerLimitMonthly: 20000,
    knowledgePageLimit: 1000,
    videoSecondsLimitMonthly: 1800,
    adminUserLimit: 30,
    websiteEmbedLimit: 3,
  },
  Enterprise: {
    aiAnswerLimitMonthly: null,
    knowledgePageLimit: null,
    videoSecondsLimitMonthly: null,
    adminUserLimit: null,
    websiteEmbedLimit: null,
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

    const { clientCompanyId, featureType } = await req.json();

    if (!clientCompanyId) {
      return json({ error: "clientCompanyId is required" }, 400);
    }

    // 企業情報取得
    const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
    if (!company) {
      return json({ error: "ClientCompany not found" }, 404);
    }

    const planName = company.planName || "Light";
    const limits = PLAN_LIMITS[planName] || PLAN_LIMITS.Light;
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Enterprise プランの場合
    if (planName === "Enterprise") {
      return json({
        isEnterpriseWithoutLimit: !limits.aiAnswerLimitMonthly,
        limitExceeded: false,
        message: "Enterprise プランは無制限です。管理画面で確認してください。",
      });
    }

    let limitData = {};

    // AI回答数のチェック
    if (featureType === "ai_answer" || !featureType) {
      if (limits.aiAnswerLimitMonthly !== null) {
        const conversations = await base44.asServiceRole.entities.ConversationLog.filter({
          clientCompanyId,
        }).then(c => c.filter(x => x.created_date?.startsWith(currentMonth)));

        const monthlyAnswers = conversations.length;
        limitData.aiAnswer = {
          current: monthlyAnswers,
          limit: limits.aiAnswerLimitMonthly,
          exceeded: monthlyAnswers >= limits.aiAnswerLimitMonthly,
          warning: monthlyAnswers >= limits.aiAnswerLimitMonthly * 0.8,
        };
      }
    }

    // 動画生成秒数のチェック
    if (featureType === "video_generation" || !featureType) {
      if (limits.videoSecondsLimitMonthly > 0) {
        const videos = await base44.asServiceRole.entities.VideoProject.filter({
          clientCompanyId,
        }).then(v => v.filter(x => x.created_date?.startsWith(currentMonth)));

        const videoSeconds = videos.reduce((sum, v) => sum + (v.durationSeconds || 0), 0);
        limitData.videoGeneration = {
          current: videoSeconds,
          limit: limits.videoSecondsLimitMonthly,
          exceeded: videoSeconds >= limits.videoSecondsLimitMonthly,
          warning: videoSeconds >= limits.videoSecondsLimitMonthly * 0.8,
        };
      } else if (limits.videoSecondsLimitMonthly === 0) {
        limitData.videoGeneration = {
          current: 0,
          limit: 0,
          exceeded: true,
          blocked: true,
          message: "このプランでは動画生成機能は利用できません。",
        };
      }
    }

    // ナレッジページ数のチェック
    if (featureType === "knowledge" || !featureType) {
      if (limits.knowledgePageLimit !== null) {
        const chunks = await base44.asServiceRole.entities.KnowledgeChunk.filter({
          clientCompanyId,
          status: "approved",
        });

        limitData.knowledge = {
          current: chunks.length,
          limit: limits.knowledgePageLimit,
          exceeded: chunks.length >= limits.knowledgePageLimit,
          warning: chunks.length >= limits.knowledgePageLimit * 0.8,
        };
      }
    }

    // 管理ユーザー数のチェック
    if (featureType === "admin_users" || !featureType) {
      if (limits.adminUserLimit !== null) {
        const adminUsers = await base44.asServiceRole.entities.User.filter({
          role: "admin",
        }).then(users => users.filter(u => u.clientCompanyId === clientCompanyId));

        limitData.adminUsers = {
          current: adminUsers.length,
          limit: limits.adminUserLimit,
          exceeded: adminUsers.length >= limits.adminUserLimit,
          warning: adminUsers.length >= limits.adminUserLimit * 0.8,
        };
      }
    }

    // Webサイト埋め込みのチェック
    if (featureType === "website_embed" || !featureType) {
      if (limits.websiteEmbedLimit > 0) {
        limitData.websiteEmbed = {
          current: 0, // TODO: 埋め込み数を取得するロジック追加
          limit: limits.websiteEmbedLimit,
          exceeded: false,
          warning: false,
        };
      } else if (limits.websiteEmbedLimit === 0) {
        limitData.websiteEmbed = {
          current: 0,
          limit: 0,
          exceeded: true,
          blocked: true,
          message: "このプランではWebサイト埋め込み機能は利用できません。",
        };
      }
    }

    return json({
      planName,
      limits,
      limitData,
      hasAnyExceeded: Object.values(limitData).some(l => l.exceeded),
    });

  } catch (error) {
    console.error("[checkPlanLimits] Error:", error?.message);
    return json({ error: error?.message || "Internal error" }, 500);
  }
});