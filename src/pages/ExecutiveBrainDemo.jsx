import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertCircle, CheckCircle2, Play, Zap, Users, FileText,
  Brain, ArrowRight, Loader2, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const DemoStep = ({ number, title, description, isActive, isCompleted, onClick, children }) => {
  const isExpanded = isActive && children;

  return (
    <Card className={`border-2 transition-all ${
      isCompleted
        ? "border-green-500/30 bg-green-50/30"
        : isActive
        ? "border-primary/50 bg-primary/5"
        : "border-border/50"
    }`}>
      <button
        onClick={onClick}
        className="w-full text-left p-5 flex items-start justify-between gap-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-start gap-4 flex-1">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
            isCompleted
              ? "bg-green-500 text-white"
              : isActive
              ? "bg-primary text-white"
              : "bg-muted text-muted-foreground"
          }`}>
            {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : number}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
        </div>
        {children && (
          isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border/50 p-5 bg-muted/10">
          {children}
        </div>
      )}
    </Card>
  );
};

export default function ExecutiveBrainDemo() {
  const { toast } = useToast();
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [reviewSelected, setReviewSelected] = useState(null);

  const { data: avatars = [], isLoading: avatarLoading } = useQuery({
    queryKey: ["demoAvatars", CLIENT_ID],
    queryFn: () =>
      base44.entities.ExecutiveAvatarProfile.filter({
        clientCompanyId: CLIENT_ID,
        description: { $contains: "デモ" },
      }),
  });

  const { data: scenarios = [] } = useQuery({
    queryKey: ["demoScenarios", CLIENT_ID],
    queryFn: () =>
      base44.entities.AvatarTrainingScenario.filter({
        clientCompanyId: CLIENT_ID,
        status: "active",
      }),
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["demoReviews", CLIENT_ID],
    queryFn: () =>
      base44.entities.WorkReviewRequest.filter({
        clientCompanyId: CLIENT_ID,
      }),
  });

  const createDemoMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("createExecutiveBrainDemoData", {
        clientCompanyId: CLIENT_ID,
      }),
    onSuccess: (res) => {
      toast({ title: "デモデータ作成完了", description: res.data.message });
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const avatar = avatars[0];
      const res = await base44.functions.invoke("startExecutiveAvatarSession", {
        clientCompanyId: CLIENT_ID,
        avatarProfileId: avatar.id,
        purpose: "training",
        scenarioId: selectedScenario?.id,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setSessionStarted(true);
      toast({ title: "セッション開始", description: data.message });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const markStepComplete = (step) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps([...completedSteps, step]);
    }
  };

  const demoAvatar = avatars[0];
  const trainingScenario = scenarios.find((s) => s.scenarioType === "training");
  const workReview = reviews[0];

  const steps = [
    {
      title: "デモアバターを確認",
      description: "代表者Brainデモの設定を確認します",
      content: !demoAvatar ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">デモアバターがまだ作成されていません。</p>
          <Button
            onClick={() => {
              createDemoMutation.mutate();
              markStepComplete(0);
            }}
            disabled={createDemoMutation.isPending}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            {createDemoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            デモデータを作成
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold">{demoAvatar.avatarName}</h4>
                <p className="text-sm text-muted-foreground">{demoAvatar.roleDescription}</p>
              </div>
              <Badge className="bg-emerald-500">{demoAvatar.consentStatus === "approved" ? "承認済み" : "保留中"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{demoAvatar.description}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <Button size="sm" variant="outline" className="text-xs gap-1">
                <ExternalLink className="w-3 h-3" /> 詳細を確認
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1"
                onClick={() => {
                  markStepComplete(0);
                  setActiveStep(1);
                }}
              >
                次へ <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "研修シナリオを選択",
      description: "新人研修シナリオで学習を開始します",
      content: (
        <div className="space-y-4">
          {scenarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">シナリオがまだ作成されていません。</p>
          ) : (
            <div className="space-y-2">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => {
                    setSelectedScenario(scenario);
                    markStepComplete(1);
                  }}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                    selectedScenario?.id === scenario.id
                      ? "border-primary bg-primary/5"
                      : "border-border/30 hover:border-border"
                  }`}
                >
                  <p className="font-medium text-sm">{scenario.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{scenario.description}</p>
                </button>
              ))}
            </div>
          )}
          {selectedScenario && (
            <Button
              className="w-full gap-2 bg-primary hover:bg-primary/90"
              onClick={() => setActiveStep(2)}
            >
              シナリオで開始 <ArrowRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      ),
    },
    {
      title: "アバター相談室を開始",
      description: "LiveAvatarまたはテキスト相談モードで実行",
      content: (
        <div className="space-y-4">
          {!sessionStarted ? (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                <p className="font-medium mb-1">ℹ️ LiveAvatar未設定の場合</p>
                <p>テキスト相談モード（TEXT_FALLBACK）で自動的に動作します。</p>
              </div>
              <Button
                onClick={() => startSessionMutation.mutate()}
                disabled={!selectedScenario || startSessionMutation.isPending}
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {startSessionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                相談を開始
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-900">
                <CheckCircle2 className="w-4 h-4 inline mr-2" />
                セッションが開始されました。
              </div>
              <Button
                className="w-full gap-2"
                onClick={() => {
                  markStepComplete(2);
                  setActiveStep(3);
                }}
              >
                評価を確認 <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "研修評価を確認",
      description: "セッションの評価スコアと改善ポイント",
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-primary">78</div>
              <p className="text-xs text-muted-foreground">評価スコア</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-emerald-600">12</div>
              <p className="text-xs text-muted-foreground">分</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">3</div>
              <p className="text-xs text-muted-foreground">アクション</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">改善ポイント</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>→ 顧客への説明がもっと具体的に</li>
              <li>→ 会社方針の引用をもっと明確に</li>
              <li>→ 相手の懸念に対する返答を充実させる</li>
            </ul>
          </div>
          <Button
            className="w-full gap-2"
            onClick={() => {
              markStepComplete(3);
              setActiveStep(4);
            }}
          >
            仕事レビューへ <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      ),
    },
    {
      title: "仕事レビューを実行",
      description: "顧客対応メールなどをAIレビュー",
      content: (
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">レビューサンプルがありません。</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <button
                  key={review.id}
                  onClick={() => setReviewSelected(review)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                    reviewSelected?.id === review.id
                      ? "border-primary bg-primary/5"
                      : "border-border/30 hover:border-border"
                  }`}
                >
                  <p className="font-medium text-sm">{review.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{review.inputText}</p>
                </button>
              ))}
            </div>
          )}
          {reviewSelected && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-900">レビュー対象</p>
                <p className="text-xs text-amber-700 mt-1 line-clamp-3">{reviewSelected.inputText}</p>
              </div>
              <Button
                className="w-full gap-2 bg-primary hover:bg-primary/90"
                onClick={() => {
                  markStepComplete(4);
                  setActiveStep(5);
                }}
              >
                改善案を生成 <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "利用ログと改善フロー",
      description: "セッション・レビュー・利用状況を表示",
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="border-border/50">
              <CardContent className="p-4">
                <Users className="w-4 h-4 text-primary mb-2" />
                <p className="text-xs text-muted-foreground">セッション数</p>
                <p className="text-2xl font-bold">1</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4">
                <FileText className="w-4 h-4 text-primary mb-2" />
                <p className="text-xs text-muted-foreground">レビュー実行</p>
                <p className="text-2xl font-bold">1</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-4">
                <Brain className="w-4 h-4 text-primary mb-2" />
                <p className="text-xs text-muted-foreground">利用アバター</p>
                <p className="text-2xl font-bold">1</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">次のステップ</p>
            <Button variant="outline" className="w-full text-xs justify-start gap-2">
              <ExternalLink className="w-3 h-3" /> セッションログを確認
            </Button>
            <Button variant="outline" className="w-full text-xs justify-start gap-2">
              <ExternalLink className="w-3 h-3" /> 利用統計を表示
            </Button>
            <Button variant="outline" className="w-full text-xs justify-start gap-2">
              <ExternalLink className="w-3 h-3" /> Context 同期を実行
            </Button>
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button className="flex-1 gap-2">
              <CheckCircle2 className="w-4 h-4" /> デモ完了
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* ヘッダー */}
        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
            <Zap className="w-4 h-4" /> 営業デモ
          </div>
          <h1 className="text-3xl font-bold text-foreground">ExecutiveBrain Avatar デモ</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            経営者・上司・熟練社員の判断基準を CompanyBrain AI と組み合わせて、
            <br />
            新人研修・仕事相談・業務監修に活用する機能です。
          </p>
        </div>

        {/* 説明パネル */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start gap-2">
                <Brain className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900">AIアバターについて</p>
                  <p className="text-sm text-blue-700 mt-1">
                    AIアバターは本人そのものではなく、本人同意と会社承認のもとで利用される教育・判断支援用のAIです。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">最終判断は人間</p>
                  <p className="text-sm text-amber-700 mt-1">
                    最終判断は常に人間の責任者が行います。AIは判断を支援するツールです。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* デモステップ */}
        <div className="space-y-3">
          {steps.map((step, i) => (
            <DemoStep
              key={i}
              number={i + 1}
              title={step.title}
              description={step.description}
              isActive={activeStep === i}
              isCompleted={completedSteps.includes(i)}
              onClick={() => setActiveStep(activeStep === i ? -1 : i)}
            >
              {step.content}
            </DemoStep>
          ))}
        </div>

        {/* 進捗表示 */}
        <Card className="border-border/50 bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">デモ進捗</p>
              <p className="text-sm font-bold text-primary">
                {completedSteps.length} / {steps.length}
              </p>
            </div>
            <div className="w-full h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(completedSteps.length / steps.length) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button variant="outline" className="gap-2">
            <ExternalLink className="w-4 h-4" /> アバター管理へ
          </Button>
          <Button variant="outline" className="gap-2">
            <ExternalLink className="w-4 h-4" /> 利用状況を見る
          </Button>
          <Button className="bg-primary hover:bg-primary/90 gap-2">
            <CheckCircle2 className="w-4 h-4" /> デモ完了 / 本運用へ
          </Button>
        </div>
      </div>
    </div>
  );
}