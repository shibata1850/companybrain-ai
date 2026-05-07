import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { clientCompanyId } = body;

    if (!clientCompanyId) {
      return Response.json({ error: 'clientCompanyId is required' }, { status: 400 });
    }

    // デモアバター作成
    const avatar = await base44.asServiceRole.entities.ExecutiveAvatarProfile.create({
      clientCompanyId,
      avatarName: '代表者Brainデモ',
      description: '会社の理念、方針、判断基準を社員や新人へ伝えるための代表者AIアバター',
      consentStatus: 'approved',
      status: 'manual_id_required',
      audienceScope: 'internal',
      systemPrompt: `あなたはSOFTDOING株式会社の代表者を模したAIアバターです。
会社の理念「地域の課題をテクノロジーで解決する」に基づいて、判断支援と教育を行います。

【話し方】
- 誠実で落ち着いた話し方
- 押し付けず、判断理由を説明する
- 難しいAIやDXを分かりやすく説明する
- 地域企業の経営者に寄り添う

【判断基準】
- 問題解決（技術ではなく課題解決を重視）
- 地域密着（地域のニーズを理解）
- 実用性（実装可能性を重視）
- 継続改善（完璧さより改善の継続）
- 信頼関係（長期的な関係構築）`,
      roleDescription: '代表取締役',
      talkingPoints: [
        '会社の理念と判断基準',
        'AI導入のメリットと注意点',
        'DXの本質',
        '地域企業向けのAI活用',
        '継続的な改善と信頼関係の重要性',
      ],
      notes: 'このアバターは代表者の同意に基づいた教育・判断支援用です。最終判断は人間が行います。',
    });

    // 研修シナリオ1: 新人向け
    const scenario1 = await base44.asServiceRole.entities.AvatarTrainingScenario.create({
      clientCompanyId,
      avatarProfileId: avatar.id,
      title: 'CompanyBrain AIとは何か',
      scenarioType: 'training',
      description: '新入社員がCompanyBrain AIの目的、使い方、注意点を理解する',
      context: '新入社員が初めてCompanyBrain AIを使う場面',
      learningObjectives: [
        'CompanyBrain AIの目的を理解する',
        'AIアバターの正体と限界を理解する',
        '適切な相談内容と不適切な相談内容を区別できる',
      ],
      evaluationCriteria:
        'AIアバターが最終判断をするのではなく、判断支援ツールであることを理解できているか',
      status: 'active',
    });

    // 研修シナリオ2: 顧客対応
    const scenario2 = await base44.asServiceRole.entities.AvatarTrainingScenario.create({
      clientCompanyId,
      avatarProfileId: avatar.id,
      title: '無理な要望への対応',
      scenarioType: 'training',
      description: '顧客から無理な要望を受けたとき、会社方針に沿って丁寧に断る・確認する方法を学ぶ',
      context: '営業が顧客から実現不可能な要望を受ける場面',
      learningObjectives: [
        '顧客の真のニーズを理解する',
        'NO という判断を誠実に説明する',
        '代替案や確認プロセスを提案する',
      ],
      evaluationCriteria:
        '押し付けず、相手の立場を尊重しながら会社方針を説明できているか',
      status: 'active',
    });

    // 研修シナリオ3: 営業
    const scenario3 = await base44.asServiceRole.entities.AvatarTrainingScenario.create({
      clientCompanyId,
      avatarProfileId: avatar.id,
      title: 'AI導入に不安を持つ顧客への説明',
      scenarioType: 'training',
      description:
        'AI導入に不安を持つ中小企業経営者へ、分かりやすく安心感のある説明ができるようにする',
      context: '経営者がAI導入のリスクや効果について不安を感じている場面',
      learningObjectives: [
        'AIの現実的な効果と限界を説明できる',
        '導入後のサポート体制を安心させられる',
        'ROIと導入期間の現実的な説明ができる',
      ],
      evaluationCriteria:
        '誇大表現を避け、実用的かつ正直な説明ができているか',
      status: 'active',
    });

    // 研修シナリオ4: 判断基準
    const scenario4 = await base44.asServiceRole.entities.AvatarTrainingScenario.create({
      clientCompanyId,
      avatarProfileId: avatar.id,
      title: '値引き相談への対応',
      scenarioType: 'decision_making',
      description:
        '値引きや契約条件に関する相談で、勝手に断定せず、会社方針と上長確認を踏まえて対応する',
      context: '顧客から値引きを求められている場面',
      learningObjectives: [
        '即断即決の判断を避ける',
        '会社方針を理解し説明する',
        '適切に上長に報告・相談する',
      ],
      evaluationCriteria:
        '責任を持って判断を保留し、適切に相談・報告できているか',
      status: 'active',
    });

    // 仕事レビューサンプル1
    const review1 = await base44.asServiceRole.entities.WorkReviewRequest.create({
      clientCompanyId,
      avatarProfileId: avatar.id,
      userId: user.id,
      title: '顧客へのAI導入説明メール',
      workType: 'email',
      inputText:
        '件名: AI導入についてのご提案\n\n【本文】\nいつもお世話になっております。\nこの度はAI導入についてご提案させていただきたく、ご連絡いたしました。\n\nAIを入れればすぐに人件費が大幅に下がります。必ず効果が出るので導入しましょう。\n\nご不明な点がございましたら、いつでもお気軽にお問い合わせください。\n\nよろしくお願いいたします。',
      reviewPurpose:
        '誇大表現や断定表現を避け、SOFTDOINGらしい誠実な説明に修正する',
      status: 'completed',
    });

    // 仕事レビューサンプル2
    const review2 = await base44.asServiceRole.entities.WorkReviewRequest.create({
      clientCompanyId,
      avatarProfileId: avatar.id,
      userId: user.id,
      title: 'CompanyBrain AI提案文',
      workType: 'proposal',
      inputText:
        'CompanyBrain AIの特徴\n\n1. 完全自動化\nCompanyBrain AIは社長の代わりにすべての判断を自動で行います。\nこれにより、経営層の負担が完全に排除されます。\n\n2. 100%正確な判断\nAIの判断は常に最適で、人間のバイアスを排除します。\n\n3. 完全な信頼性\nこのAIに基づく判断は法的責任も自動で解決します。',
      reviewPurpose:
        'AIが最終判断をするように見える表現を避け、判断支援サービスとして適切に修正する',
      status: 'completed',
    });

    return Response.json({
      success: true,
      avatar: {
        id: avatar.id,
        avatarName: avatar.avatarName,
      },
      scenarios: [
        { id: scenario1.id, title: scenario1.title },
        { id: scenario2.id, title: scenario2.title },
        { id: scenario3.id, title: scenario3.title },
        { id: scenario4.id, title: scenario4.title },
      ],
      reviews: [
        { id: review1.id, title: review1.title },
        { id: review2.id, title: review2.title },
      ],
      message: 'デモデータが作成されました。',
    });
  } catch (error) {
    console.error('[createDemoExecutiveBrainData]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});