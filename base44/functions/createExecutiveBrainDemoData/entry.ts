import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

function logDebug(level, message, data = {}) {
  const sanitized = JSON.parse(JSON.stringify(data));
  const keysToFilter = ["api_key", "token", "secret", "password", "apiKey", "accessToken"];
  keysToFilter.forEach(key => {
    for (const k in sanitized) {
      if (k.toLowerCase().includes(key.toLowerCase())) delete sanitized[k];
    }
  });
  console.log(`[${level}] ${message}`, sanitized);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const { clientCompanyId } = await req.json();

    if (!clientCompanyId) {
      return Response.json({ error: "clientCompanyId is required" }, { status: 400 });
    }

    logDebug("INFO", "Creating ExecutiveBrain demo data", { clientCompanyId });

    // 1. デモアバター作成
    const avatar = await base44.asServiceRole.entities.ExecutiveAvatarProfile.create({
      clientCompanyId,
      avatarName: "代表者Brainデモ",
      description: "SOFTDOING株式会社 代表者のAIアバター（デモ）",
      consentStatus: "approved",
      status: "manual_id_required",
      audienceScope: "internal",
      systemPrompt: `あなたはSOFTDOINGの代表者Brainです。
会社の理念、方針、判断基準を社員や新人へ分かりやすく伝えてください。

【話し方】
- 誠実で落ち着いた話し方
- 地域企業の経営者に寄り添う
- 難しいAIやDXを分かりやすく説明する

【重視する判断基準】
- 問題解決志向
- 地域密着
- 実用性
- 継続改善
- 信頼関係

【話し方のポイント】
- 丁寧でやさしく、押し付けず
- 判断理由を説明する
- ヒアリングを大切にする
- 相手の立場を尊重する`,
      roleDescription: "代表取締役",
      talkingPoints: [
        "会社の経営理念と地域密着の重要性",
        "AI導入は人間の判断を支援するツール",
        "継続改善と信頼関係の構築",
        "社員と顧客の成長が会社の成長",
      ],
      notes: "営業デモ用アバター。実在人物IDは後で登録してください。",
    });

    logDebug("INFO", "Avatar created", { avatarId: avatar.id, avatarName: avatar.avatarName });

    // 2. 研修シナリオ作成
    const scenarios = [
      {
        title: "新人研修：CompanyBrain AIとは何か",
        scenarioType: "training",
        category: "new_employee",
        description: "新入社員がCompanyBrain AIの目的、使い方、注意点を理解する",
        context: `新入社員が入社初日。CompanyBrain AIの概要を学ぶ研修。
代表者が新人に対して、親切に、わかりやすく説明します。`,
        learningObjectives: [
          "CompanyBrain AIの目的を理解する",
          "AIアバターの使い方を学ぶ",
          "使う際の注意点を理解する",
          "会社のAI活用方針を理解する",
        ],
        evaluationCriteria: "新人が質問に対して、会社方針に基づいた適切な理解を示しているか。",
      },
      {
        title: "顧客対応研修：無理な要望への対応",
        scenarioType: "customer_service",
        category: "customer_support",
        description: "顧客から無理な要望を受けたとき、会社方針に沿って丁寧に断る・確認する方法を学ぶ",
        context: `顧客から「1000万円を100万円で納めてほしい」という無理な要望を受けた。
社員はどう対応すべき？代表者に相談する形で、判断基準を学ぶ。`,
        learningObjectives: [
          "無理な要望に対する適切な判断基準を学ぶ",
          "顧客と信頼関係を保ちながら断る方法を学ぶ",
          "上長への相談フローを理解する",
          "会社方針に基づいた判断の重要性を理解する",
        ],
        evaluationCriteria: "顧客に対して誠実に、かつ丁寧に対応できるか。上長への報告・相談のタイミングが適切か。",
      },
      {
        title: "営業研修：AI導入に不安を持つ顧客への説明",
        scenarioType: "roleplay",
        category: "sales",
        description: "AI導入に不安を持つ中小企業経営者へ、分かりやすく安心感のある説明ができるようにする",
        context: `不安を持つ顧客経営者が相談に来た。
「AIで本当に効果が出るのか？」「人員削減されないか？」などの懸念を払拭しながら提案できるか。`,
        learningObjectives: [
          "顧客の不安を理解する",
          "AIは支援ツールであることを説明できる",
          "具体的な効果を分かりやすく説明できる",
          "信頼関係を築きながら提案できる",
        ],
        evaluationCriteria: "顧客の不安に寄り添い、誠実で説得力のある説明ができているか。",
      },
      {
        title: "判断基準研修：値引き相談への対応",
        scenarioType: "decision_making",
        category: "management",
        description: "値引きや契約条件に関する相談で、勝手に断定せず、会社方針と上長確認を踏まえて対応する",
        context: `大型案件で顧客から「20%値引きしてくれたら契約する」と言われた。
営業担当者として、どう判断し、どう返答すべき？`,
        learningObjectives: [
          "値引きに関する会社方針を理解する",
          "単独で判断せず上長に報告する重要性を学ぶ",
          "顧客との交渉で信頼を保つ方法を学ぶ",
          "会社の利益と顧客関係のバランスを考える",
        ],
        evaluationCriteria: "判断の必要性を認識し、適切に上長に報告・相談できているか。",
      },
    ];

    const createdScenarios = await Promise.all(
      scenarios.map((s) =>
        base44.asServiceRole.entities.AvatarTrainingScenario.create({
          clientCompanyId,
          avatarProfileId: avatar.id,
          title: s.title,
          scenarioType: s.scenarioType,
          description: s.description,
          context: s.context,
          learningObjectives: s.learningObjectives,
          evaluationCriteria: s.evaluationCriteria,
          status: "active",
        })
      )
    );

    logDebug("INFO", "Training scenarios created", { count: createdScenarios.length });

    // 3. 仕事レビューサンプル作成
    const reviews = [
      {
        title: "顧客へのAI導入説明メール",
        workType: "customer_response",
        inputText: `お疲れ様です。

いつもお世話になっております。
先日ご相談いただいたAI導入についてですが、
弊社のCompanyBrain AIを導入すればすぐに人件費が大幅に下がります。
必ず効果が出るので、ぜひ導入しましょう。

ご検討よろしくお願いいたします。`,
        reviewPurpose: "誇大表現や断定表現を避け、SOFTDOINGらしい誠実な説明に修正する",
      },
      {
        title: "CompanyBrain AI提案文",
        workType: "proposal",
        inputText: `CompanyBrain AIの特徴

CompanyBrain AIは社長の代わりにすべての判断を自動で行います。
導入するだけで、経営判断が100%自動化され、
人間の判断の余地がなくなるため、確実に効率が上がります。`,
        reviewPurpose: "AIが最終判断をするように見える表現を避け、判断支援サービスとして適切に修正する",
      },
    ];

    const createdReviews = await Promise.all(
      reviews.map((r) =>
        base44.asServiceRole.entities.WorkReviewRequest.create({
          clientCompanyId,
          avatarProfileId: avatar.id,
          userId: user.id,
          title: r.title,
          workType: r.workType,
          inputText: r.inputText,
          reviewPurpose: r.reviewPurpose,
          status: "completed",
          overallReview: "（デモデータ）",
          companyPolicyFit: 65,
          riskPoints: [
            "表現が誇大に見える",
            "AIの限界が説明されていない",
            "会社らしい慎重さが不足している",
          ],
          improvementAdvice: "（システムレビュー予定）",
          revisedDraft: "（改善案はアバター相談時に生成）",
          decisionCriteriaUsed: [
            "SOFTDOINGの丁寧さ",
            "誠実な表現",
            "顧客への信頼感",
          ],
          needHumanReview: false,
          referencedSources: [],
        })
      )
    );

    logDebug("INFO", "Work reviews created", { count: createdReviews.length });

    return Response.json({
      success: true,
      data: {
        avatarId: avatar.id,
        avatarName: avatar.avatarName,
        scenariosCount: createdScenarios.length,
        reviewsCount: createdReviews.length,
      },
      message: "ExecutiveBrain demo data created successfully",
    });

  } catch (error) {
    logDebug("ERROR", "Failed to create demo data", { error: error.message });
    return Response.json({ error: error.message }, { status: 500 });
  }
});