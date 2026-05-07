import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import {
  Brain, MessageSquare, FileText, Film, TrendingUp,
  ArrowRight, Sparkles, Globe, Users, Crown, Zap
} from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import PageHeader from "@/components/shared/PageHeader";

const CLIENT_ID = "demo-company-001";

export default function Dashboard() {
  const { data: chatLogs = [] } = useQuery({
    queryKey: ["chatLogs"],
    queryFn: () => base44.entities.ChatLog.filter({ clientCompanyId: CLIENT_ID }),
  });
  const { data: knowledgeItems = [] } = useQuery({
    queryKey: ["knowledge"],
    queryFn: () => base44.entities.Knowledge.filter({ clientCompanyId: CLIENT_ID }),
  });
  const { data: videos = [] } = useQuery({
    queryKey: ["videos"],
    queryFn: () => base44.entities.Video.filter({ clientCompanyId: CLIENT_ID }),
  });
  const { data: company = [] } = useQuery({
    queryKey: ["company"],
    queryFn: () => base44.entities.CompanyProfile.filter({ clientCompanyId: CLIENT_ID }),
  });

  const companyName = company?.[0]?.companyName || "未設定";
  const approvedKnowledge = knowledgeItems.filter(k => k.status === "approved").length;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="relative rounded-2xl bg-gradient-to-br from-[hsl(222,47%,11%)] to-[hsl(217,91%,25%)] p-8 mb-8 overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-40" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Brain className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">CompanyBrain AI</h1>
              <p className="text-white/60 text-sm">企業人格のAIプラットフォーム</p>
            </div>
          </div>
          <p className="text-white/80 text-sm max-w-xl mb-6">
            {companyName !== "未設定"
              ? `${companyName}のAIダッシュボードへようこそ。企業のナレッジを活用して、AIが会社らしく応答します。`
              : "まずは会社プロフィールを登録して、AIに企業人格を設定しましょう。"}
          </p>
          <div className="flex gap-3">
            <Link to="/chat">
              <Button className="bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm gap-2">
                <MessageSquare className="w-4 h-4" /> AIチャットを開始
              </Button>
            </Link>
            {companyName === "未設定" && (
              <Link to="/company-profile">
                <Button className="bg-accent hover:bg-accent/90 text-white gap-2">
                  <Sparkles className="w-4 h-4" /> 初期設定を始める
                </Button>
              </Link>
            )}
          </div>
        </div>
        <div className="absolute top-4 right-4 w-32 h-32 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute bottom-0 right-20 w-20 h-20 rounded-full bg-primary/20 blur-2xl" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={MessageSquare} label="AI応答数" value={chatLogs.length} subValue="今月の累計" trend={12} />
        <StatCard icon={FileText} label="ナレッジ" value={knowledgeItems.length} subValue={`${approvedKnowledge}件が承認済み`} />
        <StatCard icon={Film} label="生成動画" value={videos.length} subValue="累計" />
        <StatCard icon={TrendingUp} label="応答精度" value="94%" subValue="推定値" trend={3} />
      </div>

      {/* Quick Actions */}
      <h2 className="text-lg font-semibold mb-4">クイックアクセス</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {[
          { icon: Globe, label: "社外向けAI", desc: "顧客・パートナー向け応答", path: "/chat-external", color: "from-blue-500/10 to-cyan-500/10" },
          { icon: Users, label: "社内向けAI", desc: "従業員・新人教育用", path: "/chat-internal", color: "from-emerald-500/10 to-teal-500/10" },
          { icon: Crown, label: "経営者向けAI", desc: "経営判断・意思決定支援", path: "/chat-executive", color: "from-amber-500/10 to-orange-500/10" },
        ].map((item) => (
          <Link key={item.path} to={item.path}>
            <Card className="p-5 hover:shadow-lg transition-all duration-300 cursor-pointer group border-border/50 bg-card">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-3`}>
                <item.icon className="w-5 h-5 text-foreground/70" />
              </div>
              <h3 className="font-semibold text-sm mb-1">{item.label}</h3>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
              <ArrowRight className="w-4 h-4 text-muted-foreground/50 mt-3 group-hover:translate-x-1 transition-transform" />
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <h2 className="text-lg font-semibold mb-4">最近の回答ログ</h2>
      <Card className="divide-y divide-border border-border/50 bg-card">
        {chatLogs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
            まだ回答ログがありません。AIチャットを開始してください。
          </div>
        ) : (
          chatLogs.slice(0, 5).map((log) => (
            <div key={log.id} className="p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{log.question}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{log.answer?.slice(0, 80)}...</p>
              </div>
              <Badge variant="outline" className="ml-3 shrink-0 text-[10px]">
                {log.mode === "external" ? "社外" : log.mode === "internal" ? "社内" : "経営者"}
              </Badge>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}