import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, Lock } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

const PLAN_LIMITS = {
  Light: {
    monthlyAnswers: 1000,
    knowledgePages: 50,
    videoMinutes: 0,
    features: ["月間AI回答数 1,000", "ナレッジ 50ページ相当", "動画生成なし"],
  },
  Standard: {
    monthlyAnswers: 5000,
    knowledgePages: 200,
    videoMinutes: 10,
    features: ["月間AI回答数 5,000", "ナレッジ 200ページ相当", "動画生成 10分まで"],
  },
  Professional: {
    monthlyAnswers: 20000,
    knowledgePages: 1000,
    videoMinutes: 30,
    features: ["月間AI回答数 20,000", "ナレッジ 1,000ページ相当", "動画生成 30分まで"],
  },
  Enterprise: {
    monthlyAnswers: null,
    knowledgePages: null,
    videoMinutes: null,
    features: ["月間AI回答数 個別見積もり", "ナレッジ 個別見積もり", "動画生成 個別見積もり"],
  },
};

function UsageBar({ current, limit, label }) {
  if (!limit) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-900">{label}</p>
          <p className="text-sm font-semibold text-slate-600">個別見積もり</p>
        </div>
      </div>
    );
  }

  const percentage = Math.min((current / limit) * 100, 100);
  const isWarning = percentage >= 80;
  const isExceeded = percentage > 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-600">{current} / {limit}</p>
          {isExceeded && <Badge className="gap-1 text-[10px] bg-red-500/10 text-red-600 border-0"><AlertTriangle className="w-2.5 h-2.5" /> 超過</Badge>}
          {isWarning && !isExceeded && <Badge className="gap-1 text-[10px] bg-amber-500/10 text-amber-600 border-0"><AlertTriangle className="w-2.5 h-2.5" /> 警告</Badge>}
        </div>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full transition-all ${
            isExceeded ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">{percentage.toFixed(1)}% 使用済み</p>
    </div>
  );
}

export default function UsageAndBilling() {
  const CLIENT_ID = useClientCompanyId();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const { data: company } = useQuery({
    queryKey: ["company", CLIENT_ID],
    queryFn: () => base44.entities.ClientCompany.get(CLIENT_ID),
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", CLIENT_ID, currentMonth],
    queryFn: () =>
      base44.entities.ConversationLog.filter({ clientCompanyId: CLIENT_ID })
        .then(c => c.filter(x => x.created_date?.startsWith(currentMonth))),
  });

  const { data: videos = [] } = useQuery({
    queryKey: ["videos", CLIENT_ID, currentMonth],
    queryFn: () =>
      base44.entities.VideoProject.filter({ clientCompanyId: CLIENT_ID })
        .then(v => v.filter(x => x.created_date?.startsWith(currentMonth))),
  });

  const { data: chunks = [] } = useQuery({
    queryKey: ["chunks", CLIENT_ID],
    queryFn: () => base44.entities.KnowledgeChunk.filter({ clientCompanyId: CLIENT_ID }),
  });

  const { data: usageRecords = [] } = useQuery({
    queryKey: ["usageRecords", CLIENT_ID, currentMonth],
    queryFn: () =>
      base44.entities.UsageRecord.filter({ clientCompanyId: CLIENT_ID })
        .then(u => u.filter(x => x.created_date?.startsWith(currentMonth))),
  });

  const planName = company?.planName || "Light";
  const limits = PLAN_LIMITS[planName] || PLAN_LIMITS.Light;

  const monthlyAnswers = conversations.length;
  const knowledgeCount = chunks.filter(c => c.status === "approved").length;
  const videoSeconds = videos.reduce((sum, v) => sum + (v.durationSeconds || 0), 0);
  const videoMinutes = Math.ceil(videoSeconds / 60);

  const isEnterpriseWithoutLimits = planName === "Enterprise" && !limits.monthlyAnswers;
  const canShowLimits = limits.monthlyAnswers !== null;

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-5xl mx-auto space-y-10">
        <PageHeader
          title="料金プラン・利用状況"
          description="現在のプラン内容と月間利用状況を確認できます。"
        />

        {/* 現在のプラン */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">現在のプラン</h2>
          <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-sm font-medium text-cyan-400 mb-1">契約プラン</p>
                <p className="text-4xl font-bold text-white">{planName}</p>
              </div>
              {planName === "Enterprise" && (
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
                  カスタマイズプラン
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {limits.features.map((feature, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-200">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 利用状況 */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">今月の利用状況</h2>
          <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-6">
            {/* AI回答数 */}
            {canShowLimits ? (
              <>
                <UsageBar
                  current={monthlyAnswers}
                  limit={limits.monthlyAnswers}
                  label="AI回答数"
                />
                {monthlyAnswers > limits.monthlyAnswers && (
                  <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">
                      <strong>AI回答数が上限に達しています。</strong>プラン変更またはお問い合わせください。
                    </p>
                  </div>
                )}

                {/* 動画生成 */}
                {planName === "Light" ? (
                  <div className="p-4 rounded-lg bg-slate-100 border border-slate-200 flex items-start gap-3">
                    <Lock className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">動画生成機能</p>
                      <p className="text-sm text-slate-600 mt-1">このプランでは動画生成機能は利用できません。</p>
                    </div>
                  </div>
                ) : (
                  <UsageBar
                    current={videoMinutes}
                    limit={limits.videoMinutes}
                    label="動画生成（分）"
                  />
                )}

                {/* ナレッジ */}
                <UsageBar
                  current={knowledgeCount}
                  limit={limits.knowledgePages}
                  label="登録ナレッジ"
                />
              </>
            ) : (
              <div className="space-y-3">
                <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <p className="text-sm font-medium text-amber-900">Enterpriseプラン</p>
                  <p className="text-sm text-amber-700 mt-1">
                    利用制限は設定されていません。各利用状況のみ表示しています。
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-1">AI回答数</p>
                  <p className="text-2xl font-bold text-slate-600">{monthlyAnswers}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-1">動画生成（分）</p>
                  <p className="text-2xl font-bold text-slate-600">{videoMinutes}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-1">登録ナレッジ</p>
                  <p className="text-2xl font-bold text-slate-600">{knowledgeCount}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 警告情報 */}
        {monthlyAnswers >= limits.monthlyAnswers * 0.8 && limits.monthlyAnswers && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">月間上限まであと少しです</p>
              <p className="text-sm text-amber-800 mt-1">
                上限に達するとAI機能の利用ができなくなります。プラン変更を検討してください。
              </p>
            </div>
          </div>
        )}

        {/* プラン比較 */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">全プラン比較</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-300 font-semibold">機能</th>
                  {Object.entries(PLAN_LIMITS).map(([plan]) => (
                    <th key={plan} className={`text-center py-3 px-4 font-semibold ${planName === plan ? "text-cyan-400 bg-cyan-500/10" : "text-slate-300"}`}>
                      {plan}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-700">
                  <td className="py-3 px-4 text-slate-300">月間AI回答数</td>
                  {Object.entries(PLAN_LIMITS).map(([plan, { monthlyAnswers }]) => (
                    <td key={plan} className={`text-center py-3 px-4 ${planName === plan ? "bg-cyan-500/10" : ""}`}>
                      {monthlyAnswers ? monthlyAnswers.toLocaleString() : "無制限"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-700">
                  <td className="py-3 px-4 text-slate-300">ナレッジページ数</td>
                  {Object.entries(PLAN_LIMITS).map(([plan, { knowledgePages }]) => (
                    <td key={plan} className={`text-center py-3 px-4 ${planName === plan ? "bg-cyan-500/10" : ""}`}>
                      {knowledgePages ? knowledgePages.toLocaleString() : "無制限"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-4 text-slate-300">動画生成時間</td>
                  {Object.entries(PLAN_LIMITS).map(([plan, { videoMinutes }]) => (
                    <td key={plan} className={`text-center py-3 px-4 ${planName === plan ? "bg-cyan-500/10" : ""}`}>
                      {videoMinutes === 0 ? "なし" : videoMinutes ? `${videoMinutes}分` : "無制限"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}