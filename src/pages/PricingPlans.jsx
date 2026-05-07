import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Check, AlertTriangle, TrendingUp, FileText, Video, MessageSquare, Zap } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const PLANS = [
  {
    name: "Light",
    description: "スタートアップ向け",
    aiAnswerLimitMonthly: 1000,
    knowledgePageLimit: 50,
    videoSecondsLimitMonthly: 0,
    adminUserLimit: 3,
    websiteEmbedLimit: 0,
    features: [
      "月間AI回答数 1,000",
      "ナレッジ 50ページ相当",
      "基本的なAI機能",
      "管理ユーザー数 3",
    ],
    color: "slate",
    priceJpy: "¥99,000/月",
  },
  {
    name: "Standard",
    description: "成長段階向け",
    aiAnswerLimitMonthly: 5000,
    knowledgePageLimit: 200,
    videoSecondsLimitMonthly: 600,
    adminUserLimit: 10,
    websiteEmbedLimit: 1,
    features: [
      "月間AI回答数 5,000",
      "ナレッジ 200ページ相当",
      "動画生成 10分まで",
      "管理ユーザー数 10",
      "Webサイト埋め込み 1個",
      "優先サポート",
    ],
    color: "blue",
    priceJpy: "¥299,000/月",
  },
  {
    name: "Professional",
    description: "エンタープライズ向け",
    aiAnswerLimitMonthly: 20000,
    knowledgePageLimit: 1000,
    videoSecondsLimitMonthly: 1800,
    adminUserLimit: 30,
    websiteEmbedLimit: 3,
    features: [
      "月間AI回答数 20,000",
      "ナレッジ 1,000ページ相当",
      "動画生成 30分まで",
      "管理ユーザー数 30",
      "Webサイト埋め込み 3個",
      "専任サポート",
      "カスタムAI設定",
    ],
    color: "cyan",
    priceJpy: "¥999,000/月",
  },
  {
    name: "Enterprise",
    description: "大規模組織向け",
    aiAnswerLimitMonthly: null,
    knowledgePageLimit: null,
    videoSecondsLimitMonthly: null,
    adminUserLimit: null,
    websiteEmbedLimit: null,
    features: [
      "無制限のAI回答",
      "無制限のナレッジ",
      "無制限の動画生成",
      "無制限の管理ユーザー",
      "無制限のWebサイト埋め込み",
      "24/7 サポート",
      "SLA保証",
      "カスタム統合",
    ],
    color: "emerald",
    priceJpy: "個別見積もり",
  },
];

function PlanCard({ plan, isCurrentPlan, usage }) {
  const getColorClasses = () => {
    const colors = {
      slate: "border-slate-300 bg-slate-50",
      blue: "border-blue-300 bg-blue-50",
      cyan: "border-cyan-300 bg-cyan-50",
      emerald: "border-emerald-300 bg-emerald-50",
    };
    return colors[plan.color] || colors.slate;
  };

  const getBadgeColor = () => {
    const colors = {
      slate: "bg-slate-100 text-slate-700 border-slate-300",
      blue: "bg-blue-100 text-blue-700 border-blue-300",
      cyan: "bg-cyan-100 text-cyan-700 border-cyan-300",
      emerald: "bg-emerald-100 text-emerald-700 border-emerald-300",
    };
    return colors[plan.color] || colors.slate;
  };

  return (
    <Card className={`relative border-2 ${getColorClasses()} overflow-hidden`}>
      {isCurrentPlan && (
        <div className="absolute top-0 right-0 px-3 py-1 bg-emerald-500 text-white text-xs font-semibold">
          利用中
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-lg font-bold">{plan.name}</CardTitle>
            <Badge className={getBadgeColor()} variant="outline">
              {plan.description}
            </Badge>
          </div>
          <p className="text-sm font-semibold text-slate-900">{plan.priceJpy}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* 主要機能 */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 uppercase">プラン内容</p>
          <ul className="space-y-1.5">
            {plan.features.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-slate-700">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 利用状況（現在プラン使用中の場合のみ） */}
        {isCurrentPlan && usage && (
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase">今月の利用状況</p>

            {/* AI回答数 */}
            {plan.monthlyQueryLimit && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> AI回答数
                  </span>
                  <span className="text-xs font-semibold text-slate-900">
                    {usage.monthlyQueries.toLocaleString()} / {plan.monthlyQueryLimit.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      (usage.monthlyQueries / plan.monthlyQueryLimit) > 0.9
                        ? "bg-destructive"
                        : "bg-primary"
                    }`}
                    style={{ width: `${Math.min((usage.monthlyQueries / plan.monthlyQueryLimit) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  使用率: {((usage.monthlyQueries / plan.monthlyQueryLimit) * 100).toFixed(1)}%
                </p>
              </div>
            )}

            {/* 動画生成秒数 */}
            {plan.videoGenerationSeconds > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 flex items-center gap-1">
                    <Video className="w-3 h-3" /> 動画生成
                  </span>
                  <span className="text-xs font-semibold text-slate-900">
                    {usage.videoGenerationSeconds} / {plan.videoGenerationSeconds}秒
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      (usage.videoGenerationSeconds / plan.videoGenerationSeconds) > 0.9
                        ? "bg-destructive"
                        : "bg-primary"
                    }`}
                    style={{ width: `${Math.min((usage.videoGenerationSeconds / plan.videoGenerationSeconds) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  使用率: {((usage.videoGenerationSeconds / plan.videoGenerationSeconds) * 100).toFixed(1)}%
                </p>
              </div>
            )}

            {/* ナレッジ */}
            {plan.knowledgePageLimit && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> ナレッジ
                  </span>
                  <span className="text-xs font-semibold text-slate-900">
                    {usage.knowledgeCount} / {plan.knowledgePageLimit}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      (usage.knowledgeCount / plan.knowledgePageLimit) > 0.9
                        ? "bg-destructive"
                        : "bg-primary"
                    }`}
                    style={{ width: `${Math.min((usage.knowledgeCount / plan.knowledgePageLimit) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  使用率: {((usage.knowledgeCount / plan.knowledgePageLimit) * 100).toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* CTA ボタン */}
        <Button className={`w-full mt-2 ${isCurrentPlan ? "opacity-50 cursor-default" : ""}`} disabled={isCurrentPlan}>
          {isCurrentPlan ? "現在のプラン" : "プランに変更"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PricingPlans() {
  const { toast } = useToast();

  // 今月のデータ取得
  const currentMonth = new Date().toISOString().slice(0, 7);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", CLIENT_ID, currentMonth],
    queryFn: () =>
      base44.entities.ConversationLog.filter({ clientCompanyId: CLIENT_ID })
        .then(c => c.filter(x => x.created_date?.startsWith(currentMonth)))
  });

  const { data: videos = [] } = useQuery({
    queryKey: ["videos", CLIENT_ID, currentMonth],
    queryFn: () =>
      base44.entities.VideoProject.filter({ clientCompanyId: CLIENT_ID })
        .then(v => v.filter(x => x.created_date?.startsWith(currentMonth)))
  });

  const { data: sources = [] } = useQuery({
    queryKey: ["sources", CLIENT_ID],
    queryFn: () => base44.entities.KnowledgeSource.filter({ clientCompanyId: CLIENT_ID }),
  });

  const { data: usageRecords = [] } = useQuery({
    queryKey: ["usageRecords", CLIENT_ID, currentMonth],
    queryFn: () =>
      base44.entities.UsageRecord.filter({ clientCompanyId: CLIENT_ID })
        .then(u => u.filter(x => x.created_date?.startsWith(currentMonth)))
  });

  const { data: company } = useQuery({
    queryKey: ["company", CLIENT_ID],
    queryFn: () => base44.entities.ClientCompany.get(CLIENT_ID),
  });

  // 利用状況の計算
  const monthlyQueries = conversations.length;
  const videoGenerationSeconds = videos.reduce((sum, v) => sum + (v.durationSeconds || 0), 0);
  const knowledgeCount = sources.length;

  // UsageRecordから今月の利用を集計
  const usageByType = {
    ai_answer: 0,
    script_generation: 0,
    tts: 0,
    lipsync: 0,
    file_upload: 0,
  };
  usageRecords.forEach(record => {
    if (usageByType.hasOwnProperty(record.usageType)) {
      usageByType[record.usageType] += record.units || 0;
    }
  });

  const usage = {
    monthlyQueries,
    videoGenerationSeconds,
    knowledgeCount,
  };

  // 現在のプランを判定
  const currentPlanName = company?.planName || "Light";
  const currentPlan = PLANS.find(p => p.name === currentPlanName);

  // 超過警告
  const warnings = [];
  if (currentPlan && currentPlan.monthlyQueryLimit) {
    if (monthlyQueries >= currentPlan.monthlyQueryLimit * 0.9) {
      warnings.push(`AI回答数が制限に近づいています（${((monthlyQueries / currentPlan.monthlyQueryLimit) * 100).toFixed(0)}%使用）`);
    }
  }
  if (currentPlan && currentPlan.videoGenerationSeconds > 0) {
    if (videoGenerationSeconds >= currentPlan.videoGenerationSeconds * 0.9) {
      warnings.push(`動画生成が制限に近づいています（${((videoGenerationSeconds / currentPlan.videoGenerationSeconds) * 100).toFixed(0)}%使用）`);
    }
  }
  if (currentPlan && currentPlan.knowledgePageLimit) {
    if (knowledgeCount >= currentPlan.knowledgePageLimit * 0.9) {
      warnings.push(`ナレッジが制限に近づいています（${((knowledgeCount / currentPlan.knowledgePageLimit) * 100).toFixed(0)}%使用）`);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <PageHeader
          title="料金プラン・利用状況"
          description="現在のプランと利用状況を確認。必要に応じてアップグレードできます。"
        />

        {/* 超過警告 */}
        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((warning, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200"
              >
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700">{warning}</p>
              </div>
            ))}
          </div>
        )}

        {/* プラン一覧 */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">利用可能なプラン</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.name}
                plan={plan}
                isCurrentPlan={plan.name === currentPlanName}
                usage={plan.name === currentPlanName ? usage : null}
              />
            ))}
          </div>
        </div>

        {/* 詳細な利用統計 */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">詳細な利用状況（今月）</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  AI回答数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-slate-900">{monthlyQueries.toLocaleString()}</p>
                {currentPlan?.aiAnswerLimitMonthly && (
                  <p className="text-xs text-slate-500 mt-2">
                    制限: {currentPlan.aiAnswerLimitMonthly.toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Video className="w-4 h-4 text-purple-600" />
                  動画生成
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-slate-900">
                  {Math.floor(videoGenerationSeconds / 60)}:{String(videoGenerationSeconds % 60).padStart(2, "0")}
                </p>
                {currentPlan?.videoSecondsLimitMonthly !== undefined && (
                  <p className="text-xs text-slate-500 mt-2">
                    制限: {currentPlan.videoSecondsLimitMonthly}秒
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" />
                  ナレッジ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-slate-900">{knowledgeCount.toLocaleString()}</p>
                {currentPlan?.knowledgePageLimit && (
                  <p className="text-xs text-slate-500 mt-2">
                    制限: {currentPlan.knowledgePageLimit}ページ
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* プラン詳細比較テーブル */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">全プラン詳細比較</h2>
          <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">機能</th>
                  {PLANS.map(plan => (
                    <th
                      key={plan.name}
                      className={`text-center py-3 px-4 font-semibold ${
                        currentPlanName === plan.name ? "bg-cyan-50 text-cyan-900" : "text-slate-900"
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="py-3 px-4 text-slate-900 font-medium">月間AI回答数</td>
                  {PLANS.map(plan => (
                    <td
                      key={plan.name}
                      className={`text-center py-3 px-4 ${currentPlanName === plan.name ? "bg-cyan-50" : ""}`}
                    >
                      {plan.aiAnswerLimitMonthly ? plan.aiAnswerLimitMonthly.toLocaleString() : "無制限"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-3 px-4 text-slate-900 font-medium">ナレッジページ数</td>
                  {PLANS.map(plan => (
                    <td
                      key={plan.name}
                      className={`text-center py-3 px-4 ${currentPlanName === plan.name ? "bg-cyan-50" : ""}`}
                    >
                      {plan.knowledgePageLimit ? plan.knowledgePageLimit.toLocaleString() : "無制限"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-3 px-4 text-slate-900 font-medium">動画生成（秒）</td>
                  {PLANS.map(plan => (
                    <td
                      key={plan.name}
                      className={`text-center py-3 px-4 ${currentPlanName === plan.name ? "bg-cyan-50" : ""}`}
                    >
                      {plan.videoSecondsLimitMonthly === 0
                        ? "制限あり"
                        : plan.videoSecondsLimitMonthly
                        ? plan.videoSecondsLimitMonthly
                        : "無制限"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-3 px-4 text-slate-900 font-medium">管理ユーザー数</td>
                  {PLANS.map(plan => (
                    <td
                      key={plan.name}
                      className={`text-center py-3 px-4 ${currentPlanName === plan.name ? "bg-cyan-50" : ""}`}
                    >
                      {plan.adminUserLimit ? plan.adminUserLimit : "無制限"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-4 text-slate-900 font-medium">Webサイト埋め込み</td>
                  {PLANS.map(plan => (
                    <td
                      key={plan.name}
                      className={`text-center py-3 px-4 ${currentPlanName === plan.name ? "bg-cyan-50" : ""}`}
                    >
                      {plan.websiteEmbedLimit === 0
                        ? "制限あり"
                        : plan.websiteEmbedLimit
                        ? plan.websiteEmbedLimit
                        : "無制限"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">よくある質問</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">超過した場合はどうなりますか？</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                制限に達した場合、その月は追加の利用ができなくなります。翌月にリセットされます。超過が見込まれる場合はプランのアップグレードをお勧めします。
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">プラン変更は反映されていつから有効ですか？</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                プラン変更は即座に反映され、翌月から新しい制限値が適用されます。月途中での変更も可能です。
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">ナレッジのページ数はどうやって計算されますか？</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                1つのナレッジソースを1ページとしてカウントします。複数のチャンクに分割されても、ソースは1カウント。
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Enterprise プランについて</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Enterprise プランは完全カスタマイズ可能です。営業チームにお問い合わせください。
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}