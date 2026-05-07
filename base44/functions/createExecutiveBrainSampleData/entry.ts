import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin only" }, { status: 403 });
    }

    const { clientCompanyId } = await req.json();

    if (!clientCompanyId) {
      return Response.json({ error: "Missing clientCompanyId" }, { status: 400 });
    }

    const company = await base44.asServiceRole.entities.ClientCompany.get(clientCompanyId);
    if (!company) {
      return Response.json({ error: "ClientCompany not found" }, { status: 404 });
    }

    // サンプルアバタープロファイル作成
    const avatarProfile = await base44.asServiceRole.entities.ExecutiveAvatarProfile.create({
      clientCompanyId,
      avatarName: company.representativeName || "代表者Brain デモ",
      description: "${company.companyName} の経営方針・判断基準を体現するAIアバター",
      consentStatus: "pending",
      status: "draft",
      audienceScope: "training",
      roleDescription: "${company.representativeName || '代表者'}として、新入社員や営業スタッフに経営方針を伝え、ロールプレイを指導する。",
      notes: "デモンストレーション用。本運用前に本人同意（consentStatus = approved）が必要です。",
    });

    // サンプルシナリオ作成
    const scenarios = [
      {
        clientCompanyId,
        avatarProfileId: avatarProfile.id,
        title: "新入社員向けオリエンテーション",
        scenarioType: "training",
        description: "会社の理念・方針・判断基準を新入社員に説明するシナリオ",
        context: "入社初日。新入社員が会社のビジョンと実務ルールを学ぶ。",
        learningObjectives: [
          "会社のミッション・ビジョンを理解する",
          "判断の際の基準を学ぶ",
          "顧客対応における会社らしさを理解する",
        ],
        evaluationCriteria: "会社方針への理解度（60%）、質問への回答の質（40%）",
      },
      {
        clientCompanyId,
        avatarProfileId: avatarProfile.id,
        title: "営業ロールプレイ - 顧客提案",
        scenarioType: "roleplay",
        description: "営業スタッフが顧客提案を行い、代表者の視点からフィードバックを受けるシナリオ",
        context: "大型案件の顧客提案。営業スタッフが提案資料をプレゼンし、経営陣（アバター）からコメントを受ける。",
        learningObjectives: [
          "会社の強み・差別化ポイントを顧客に伝える能力",
          "会社方針に沿った提案をする",
          "顧客ニーズと会社戦略のバランスを取る",
        ],
        evaluationCriteria: "提案内容の会社方針との適合性（50%）、顧客対応スキル（50%）",
      },
      {
        clientCompanyId,
        avatarProfileId: avatarProfile.id,
        title: "問題解決シナリオ - 困難な顧客対応",
        scenarioType: "decision_making",
        description: "困難な顧客トラブルへの対応について、代表者と共に解決策を検討するシナリオ",
        context: "顧客クレーム。社員の判断が会社の方針に沿っているか、経営陣（アバター）が確認し指導する。",
        learningObjectives: [
          "会社の判断基準を実際の問題に適用する",
          "リスク管理と顧客満足度のバランスを取る",
          "エスカレーション判断を適切に行う",
        ],
        evaluationCriteria: "判断基準の正確性（60%）、リスク回避能力（40%）",
      },
    ];

    const createdScenarios = await Promise.all(
      scenarios.map(s => base44.asServiceRole.entities.AvatarTrainingScenario.create(s))
    );

    // サンプルWorking Review データ（履歴用）
    const sampleWorkReviews = [
      {
        clientCompanyId,
        avatarProfileId: avatarProfile.id,
        userId: user.id,
        title: "顧客への提案メール案",
        workType: "email",
        inputText: "お疲れ様です。前回のご相談に基づいて、提案内容をまとめました。ご都合つく時間にお打ち合わせさせていただきたく、よろしくお願いします。",
        reviewPurpose: "会社のトーン・方針に沿った顧客メールか確認",
        overallReview: "デモレビュー：丁寧な文体で会社らしい提案メールです。",
        companyPolicyFit: 85,
        riskPoints: [],
        improvementAdvice: "具体的なメリットを1-2件追加すると、さらに説得力が増します。",
        revisedDraft: "お疲れ様です。前回のご相談に基づいて、${product}による業務効率化のご提案をまとめました。年間で約30%のコスト削減を見込んでいます。ご都合つく時間にお打ち合わせさせていただきたく、よろしくお願いします。",
        decisionCriteriaUsed: ["顧客優先", "透明性"],
        needHumanReview: false,
        referencedSources: ["提案方針"],
        status: "completed",
      },
    ];

    const createdReviews = await Promise.all(
      sampleWorkReviews.map(r => base44.asServiceRole.entities.WorkReviewRequest.create(r))
    );

    return Response.json({
      success: true,
      avatarProfile,
      scenarios: createdScenarios,
      workReviews: createdReviews,
      message: `ExecutiveBrain Avatar デモデータが作成されました。
アバター名: ${avatarProfile.avatarName}
- 新入社員研修シナリオ1件
- 営業ロールプレイシナリオ1件
- 問題解決シナリオ1件
- サンプルレビュー1件

consentStatus = pending のため、本運用前に本人同意（consentStatus = approved に更新）が必要です。`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});