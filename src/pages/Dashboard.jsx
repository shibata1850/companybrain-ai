import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";
import {
  BookOpen, CheckCircle2, MessageSquare, Video, AlertTriangle,
  BarChart3, TrendingUp, Clock, Users
} from "lucide-react";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

function StatCard({ label, value, icon: Icon, subvalue, trend }) {
  return (
    <div className="bg-white rounded-2xl p-6 space-y-2 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-cyan-500" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-3xl font-bold text-slate-900">{value}</p>
        {subvalue && <p className="text-xs text-slate-500">{subvalue}</p>}
        {trend && <p className={`text-xs font-medium ${trend > 0 ? "text-emerald-600" : "text-slate-600"}`}>
          {trend > 0 ? "↑" : "→"} {Math.abs(trend)}%
        </p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const CLIENT_ID = useClientCompanyId();
  const { data: company } = useQuery({
    queryKey: ["company", CLIENT_ID],
    queryFn: () => base44.entities.ClientCompany.get(CLIENT_ID),
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", CLIENT_ID],
    queryFn: () => base44.entities.ConversationLog.filter({ clientCompanyId: CLIENT_ID }),
  });

  const { data: chunks = [] } = useQuery({
    queryKey: ["knowledge", CLIENT_ID],
    queryFn: () => base44.entities.KnowledgeChunk.filter({ clientCompanyId: CLIENT_ID }),
  });

  const { data: sources = [] } = useQuery({
    queryKey: ["sources", CLIENT_ID],
    queryFn: () => base44.entities.KnowledgeSource.filter({ clientCompanyId: CLIENT_ID }),
  });

  const { data: videos = [] } = useQuery({
    queryKey: ["videos", CLIENT_ID],
    queryFn: () => base44.entities.VideoProject.filter({ clientCompanyId: CLIENT_ID }),
  });

  const { data: metrics = [] } = useQuery({
    queryKey: ["metrics", CLIENT_ID],
    queryFn: () => base44.entities.MetricSnapshot.filter({ clientCompanyId: CLIENT_ID }).then(m => {
      const thisMonth = new Date().toISOString().slice(0, 7);
      return m.filter(x => x.month === thisMonth);
    }),
  });

  // 統計計算
  const approvedChunks = chunks.filter(c => c.status === "approved").length;
  const monthlyQuestions = conversations.length;
  const publicQuestions = conversations.filter(c => c.channel === "public").length;
  const internalQuestions = conversations.filter(c => c.channel === "internal").length;
  const executiveQuestions = conversations.filter(c => c.channel === "executive").length;
  const needsReview = conversations.filter(c => c.needHumanReview).length;
  const completedVideos = videos.filter(v => v.status === "completed").length;
  const currentMetric = metrics[0] || {};

  // グラフデータ生成
  const dailyQuestions = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toISOString().split("T")[0];
    const count = conversations.filter(c =>
      c.created_date?.startsWith(dateStr)
    ).length;
    return { date: date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }), count };
  });

  const categoryData = [
    { name: "company", value: chunks.filter(c => c.category === "company").length },
    { name: "service", value: chunks.filter(c => c.category === "service").length },
    { name: "sales", value: chunks.filter(c => c.category === "sales").length },
    { name: "support", value: chunks.filter(c => c.category === "support").length },
    { name: "other", value: chunks.filter(c => c.category === "other").length },
  ].filter(c => c.value > 0);

  const reviewData = [
    { name: "未回答", value: conversations.filter(c => !c.answer).length },
    { name: "確認必要", value: needsReview },
    { name: "完了", value: conversations.filter(c => c.answer && !c.needHumanReview).length },
  ].filter(d => d.value > 0);

  const videoDurationData = videos.map(v => ({
    title: v.title?.slice(0, 12) || "Video",
    duration: v.durationSeconds || 0,
  })).slice(-5);

  const COLORS = ["#06b6d4", "#0891b2", "#06b6d4", "#06b6d4", "#06b6d4"];

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-7xl mx-auto space-y-10">
        {/* ヘッダー */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-white">{company?.companyName || "ダッシュボード"}</h1>
          <p className="text-slate-400">CompanyBrain AI ダッシュボード</p>
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="登録ナレッジ" value={sources.length} icon={BookOpen} />
          <StatCard label="承認済み" value={approvedChunks} icon={CheckCircle2} />
          <StatCard label="今月の質問数" value={monthlyQuestions} icon={MessageSquare} />
          <StatCard label="確認が必要" value={needsReview} icon={AlertTriangle} />
          <StatCard label="生成動画" value={completedVideos} icon={Video} />
        </div>

        {/* チャネル別質問数 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <p className="text-sm font-medium text-slate-600 mb-3">社外向け質問</p>
            <p className="text-4xl font-bold text-cyan-500">{publicQuestions}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <p className="text-sm font-medium text-slate-600 mb-3">社内向け質問</p>
            <p className="text-4xl font-bold text-cyan-500">{internalQuestions}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <p className="text-sm font-medium text-slate-600 mb-3">経営者向け質問</p>
            <p className="text-4xl font-bold text-cyan-500">{executiveQuestions}</p>
          </div>
        </div>

        {/* グラフ行1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 日別質問数 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <p className="text-sm font-semibold text-slate-900 mb-4">過去7日の質問数</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyQuestions}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }} />
                <Line type="monotone" dataKey="count" stroke="#06b6d4" strokeWidth={3} dot={{ fill: "#06b6d4" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ステータス分布 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <p className="text-sm font-semibold text-slate-900 mb-4">回答ステータス</p>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={reviewData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={100}
                  fill="#06b6d4"
                  dataKey="value"
                >
                  {reviewData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* グラフ行2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* カテゴリ別 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <p className="text-sm font-semibold text-slate-900 mb-4">ナレッジ カテゴリ別</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }} />
                <Bar dataKey="value" fill="#06b6d4" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 動画分数 */}
          {videoDurationData.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <p className="text-sm font-semibold text-slate-900 mb-4">動画生成分数</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={videoDurationData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="title" stroke="#94a3b8" angle={-45} textAnchor="end" height={80} />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }} />
                  <Bar dataKey="duration" fill="#06b6d4" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* 推定ROI */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">推定削減時間</p>
              <p className="text-4xl font-bold text-cyan-500">{currentMetric.estimatedSavedHours || 0}h</p>
              <p className="text-xs text-slate-500">今月の削減効果</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">推定ROI</p>
              <p className="text-4xl font-bold text-cyan-500">¥{(currentMetric.estimatedRoiYen || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-500">金銭換算による効果</p>
            </div>
          </div>
        </div>

        {/* 最近の質問 */}
        {conversations.length > 0 && (
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <p className="text-sm font-semibold text-slate-900 mb-4">最近の質問・回答</p>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {conversations.slice(-8).reverse().map((conv, i) => (
                <div key={i} className="pb-3 border-b border-slate-100 last:border-b-0 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-900 line-clamp-1">{conv.question}</p>
                    <div className="flex gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px]">{conv.channel}</Badge>
                      {conv.needHumanReview && <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-0">確認要</Badge>}
                    </div>
                  </div>
                  <p className="text-slate-600 line-clamp-1 text-xs">{conv.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}