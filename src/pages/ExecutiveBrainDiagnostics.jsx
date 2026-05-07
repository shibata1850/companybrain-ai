import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  CheckCircle2, AlertCircle, XCircle, Zap, Server, Lock,
  RefreshCw, ChevronDown, ChevronUp
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const StatusIcon = ({ status }) => {
  if (status === "ok") return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
  if (status === "warning") return <AlertCircle className="w-5 h-5 text-amber-500" />;
  return <XCircle className="w-5 h-5 text-destructive" />;
};

const StatusBadge = ({ status }) => {
  const variants = {
    ok: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    warning: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    error: "bg-destructive/10 text-destructive border-destructive/30",
  };
  const labels = { ok: "OK", warning: "警告", error: "エラー" };
  return (
    <Badge variant="outline" className={variants[status]}>
      {labels[status]}
    </Badge>
  );
};

export default function ExecutiveBrainDiagnostics() {
  const { toast } = useToast();
  const [expandedSection, setExpandedSection] = useState(null);

  const diagMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("debugExecutiveBrainIntegration", {
        clientCompanyId: CLIENT_ID,
      }).then(res => res.data),
    onError: (err) => {
      toast({
        title: "診断実行エラー",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const { data: diagnostics, isLoading } = useQuery({
    queryKey: ["diagnostics"],
    queryFn: () =>
      base44.functions.invoke("debugExecutiveBrainIntegration", {
        clientCompanyId: CLIENT_ID,
      }).then(res => res.data),
    refetchOnWindowFocus: false,
  });

  // 診断結果を解析
  const getOverallStatus = () => {
    if (!diagnostics) return "loading";
    if (diagnostics.error) return "error";
    const criticalItems = [
      diagnostics.hasGeminiKey,
      diagnostics.hasHeygenKey,
      diagnostics.companyExists,
      diagnostics.avatarExists,
    ];
    if (criticalItems.some(item => !item)) return "error";
    if (!diagnostics.hasLiveAvatarKey) return "warning";
    return "ok";
  };

  const overallStatus = getOverallStatus();

  const sections = [
    {
      title: "API キー設定",
      id: "api_keys",
      items: [
        {
          label: "Gemini API キー",
          value: diagnostics?.hasGeminiKey ? "設定済み" : "未設定",
          status: diagnostics?.hasGeminiKey ? "ok" : "error",
          help: "CompanyBrain のメイン LLM です。必須です。",
          action: !diagnostics?.hasGeminiKey && "BASE44 Secrets で GEMINI_API_KEY を設定してください。",
        },
        {
          label: "HeyGen API キー",
          value: diagnostics?.hasHeygenKey ? "設定済み" : "未設定",
          status: diagnostics?.hasHeygenKey ? "ok" : "error",
          help: "アバター動画生成に必須です。",
          action: !diagnostics?.hasHeygenKey && "BASE44 Secrets で HEYGEN_API_KEY を設定してください。",
        },
        {
          label: "LiveAvatar API キー",
          value: diagnostics?.hasLiveAvatarKey ? "設定済み" : "未設定",
          status: diagnostics?.hasLiveAvatarKey ? "ok" : "warning",
          help: "リアルタイム会話に必須です。未設定の場合は TEXT_FALLBACK モードで運用できます。",
          action: !diagnostics?.hasLiveAvatarKey && "リアルタイム会話が必要な場合は BASE44 Secrets で LIVEAVATAR_API_KEY を設定してください。",
        },
      ],
    },
    {
      title: "API 接続確認",
      id: "api_connectivity",
      items: [
        {
          label: "Gemini 接続",
          value: diagnostics?.geminiConnected ? "接続 OK" : "接続NG",
          status: diagnostics?.geminiConnected ? "ok" : "error",
          help: `Status: ${diagnostics?.geminiStatusCode || "不明"}`,
        },
        {
          label: "HeyGen 接続",
          value: diagnostics?.heygenConnected ? "接続 OK" : "接続NG",
          status: diagnostics?.heygenConnected ? "ok" : "error",
          help: `Status: ${diagnostics?.heygenStatusCode || "不明"}`,
        },
        {
          label: "LiveAvatar 接続",
          value: diagnostics?.liveAvatarConnected ? "接続 OK" : "接続 未確認",
          status: diagnostics?.liveAvatarConnected ? "ok" : diagnostics?.hasLiveAvatarKey ? "error" : "warning",
          help: diagnostics?.liveAvatarConnected ? "接続確認済み" : "キーが未設定か、接続できていません。",
        },
      ],
    },
    {
      title: "Entity データ確認",
      id: "entity_data",
      items: [
        {
          label: "ClientCompany",
          value: diagnostics?.companyExists ? "見つかった" : "見つかりません",
          status: diagnostics?.companyExists ? "ok" : "error",
          help: diagnostics?.companyName ? `会社名: ${diagnostics.companyName}` : "ClientCompany が登録されていません。",
        },
        {
          label: "ExecutiveAvatarProfile",
          value: diagnostics?.avatarExists ? "見つかった" : "見つかりません",
          status: diagnostics?.avatarExists ? "ok" : "error",
          help: diagnostics?.avatarExists ? `アバター: ${diagnostics.avatarName}` : "ExecutiveAvatarProfile が登録されていません。",
        },
      ],
    },
    {
      title: "アバター設定確認",
      id: "avatar_config",
      items: diagnostics?.avatarExists ? [
        {
          label: "アバター名",
          value: diagnostics?.avatarName || "未設定",
          status: diagnostics?.avatarName ? "ok" : "warning",
        },
        {
          label: "本人同意状態",
          value: diagnostics?.consentStatus || "不明",
          status: diagnostics?.consentStatus === "approved" ? "ok" : "warning",
          help: diagnostics?.consentStatus !== "approved" && "本人同意が承認されていません。同意・素材登録画面で処理してください。",
        },
        {
          label: "アバター状態",
          value: diagnostics?.avatarStatus || "不明",
          status: diagnostics?.avatarStatus === "active" ? "ok" : "warning",
        },
        {
          label: "HeyGen Avatar ID",
          value: diagnostics?.hasHeygenAvatarId ? "登録済み" : "未登録",
          status: diagnostics?.hasHeygenAvatarId ? "ok" : "warning",
        },
        {
          label: "HeyGen Voice ID",
          value: diagnostics?.hasHeygenVoiceId ? "登録済み" : "未登録",
          status: diagnostics?.hasHeygenVoiceId ? "ok" : "warning",
        },
        {
          label: "LiveAvatar Avatar ID",
          value: diagnostics?.hasLiveAvatarAvatarId ? "登録済み" : "未登録",
          status: diagnostics?.hasLiveAvatarAvatarId ? "ok" : "warning",
        },
        {
          label: "LiveAvatar Voice ID",
          value: diagnostics?.hasLiveAvatarVoiceId ? "登録済み" : "未登録",
          status: diagnostics?.hasLiveAvatarVoiceId ? "ok" : "warning",
        },
        {
          label: "LiveAvatar Context ID",
          value: diagnostics?.hasLiveAvatarContextId ? "登録済み" : "未登録",
          status: diagnostics?.hasLiveAvatarContextId ? "ok" : "warning",
          help: "Context ID は syncExecutiveAvatarContext で自動設定できます。",
        },
      ] : [],
    },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="ExecutiveBrain 診断"
        description="ExecutiveBrain Avatar システムの設定と接続状況を確認します。"
      />

      {/* 全体ステータス */}
      <Card className={`border-2 ${
        overallStatus === "ok" ? "border-emerald-500/30 bg-emerald-500/5" :
        overallStatus === "warning" ? "border-amber-500/30 bg-amber-500/5" :
        overallStatus === "error" ? "border-destructive/30 bg-destructive/5" :
        "border-border"
      }`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <StatusIcon status={overallStatus} />
              <div>
                <p className="font-semibold text-lg">
                  {overallStatus === "ok" && "全設定OK"}
                  {overallStatus === "warning" && "警告あり"}
                  {overallStatus === "error" && "エラーがあります"}
                  {overallStatus === "loading" && "診断中..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {overallStatus === "ok" && "ExecutiveBrain Avatar を利用できます。"}
                  {overallStatus === "warning" && "基本機能は使用できますが、いくつか未設定項目があります。"}
                  {overallStatus === "error" && "critical な設定項目が不足しています。下記を確認してください。"}
                </p>
              </div>
            </div>
            <Button
              onClick={() => diagMutation.mutate()}
              disabled={diagMutation.isPending}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${diagMutation.isPending ? "animate-spin" : ""}`} />
              再診断
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* エラーメッセージ */}
      {diagnostics?.error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive mb-1">エラー</p>
                <p className="text-sm text-destructive/80">{diagnostics.error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 診断セクション */}
      <div className="space-y-3">
        {sections.map((section) => (
          <Card key={section.id} className="border-border/50">
            <button
              onClick={() =>
                setExpandedSection(expandedSection === section.id ? null : section.id)
              }
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
            >
              <h3 className="font-semibold text-sm">{section.title}</h3>
              {expandedSection === section.id ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>

            {expandedSection === section.id && (
              <div className="border-t border-border/50 px-6 py-4 space-y-4">
                {section.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">データなし</p>
                ) : (
                  section.items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-4 pb-4 border-b border-border/30 last:border-b-0 last:pb-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium mb-1">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.help || ""}</p>
                        {item.action && (
                          <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {item.action}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm text-muted-foreground text-right">
                          {item.value}
                        </span>
                        <StatusIcon status={item.status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* 次のステップ */}
      {overallStatus !== "ok" && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              次のステップ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!diagnostics?.hasGeminiKey && (
              <div>
                <p className="font-medium text-amber-700">1. Gemini API キーを設定</p>
                <p className="text-amber-600/80">BASE44 Secrets → GEMINI_API_KEY</p>
              </div>
            )}
            {!diagnostics?.hasHeygenKey && (
              <div>
                <p className="font-medium text-amber-700">2. HeyGen API キーを設定</p>
                <p className="text-amber-600/80">BASE44 Secrets → HEYGEN_API_KEY</p>
              </div>
            )}
            {!diagnostics?.companyExists && (
              <div>
                <p className="font-medium text-amber-700">3. ClientCompany を登録</p>
                <p className="text-amber-600/80">会社プロフィール画面で会社情報を入力</p>
              </div>
            )}
            {!diagnostics?.avatarExists && (
              <div>
                <p className="font-medium text-amber-700">4. ExecutiveAvatarProfile を作成</p>
                <p className="text-amber-600/80">AIアバター管理画面で新規作成</p>
              </div>
            )}
            {diagnostics?.avatarExists && diagnostics?.consentStatus !== "approved" && (
              <div>
                <p className="font-medium text-amber-700">5. 本人同意を承認</p>
                <p className="text-amber-600/80">同意・素材登録画面で本人確認書を処理</p>
              </div>
            )}
            {diagnostics?.avatarExists && !diagnostics?.hasHeygenAvatarId && (
              <div>
                <p className="font-medium text-amber-700">6. アバター ID を登録</p>
                <p className="text-amber-600/80">アバター作成・ID設定画面で avatar_id を登録</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}