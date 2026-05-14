import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertCircle, Play, CheckCircle, Loader2, Brain, User, Award
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import ReactMarkdown from "react-markdown";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

export default function NewEmployeeTraining() {
  const CLIENT_ID = useClientCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollRef = useRef(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [evaluation, setEvaluation] = useState(null);

  const { data: scenarios = [] } = useQuery({
    queryKey: ["trainingScenarios", CLIENT_ID],
    queryFn: () =>
      base44.entities.AvatarTrainingScenario.filter({
        clientCompanyId: CLIENT_ID,
        status: "active",
      }),
  });

  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () =>
      sessionId ? base44.entities.AvatarConversationSession.get(sessionId) : null,
    enabled: !!sessionId,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const startSessionMutation = useMutation({
    mutationFn: () => {
      const scenario = scenarios.find((s) => s.id === selectedScenarioId);
      return base44.functions.invoke("startExecutiveAvatarSession", {
        clientCompanyId: CLIENT_ID,
        avatarProfileId: scenario?.avatarProfileId,
        purpose: "training",
        scenario: selectedScenarioId,
      });
    },
    onSuccess: (res) => {
      setSessionId(res.data.session.id);
      toast({ title: "研修開始", description: "シナリオがスタートしました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message) => {
      const res = await base44.functions.invoke("askCompanyBrain", {
        clientCompanyId: CLIENT_ID,
        question: message,
        channel: "internal",
      });
      return res.data;
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", ...data }]);
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("stopExecutiveAvatarSession", {
        avatarConversationSessionId: sessionId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast({ title: "セッション終了", description: "評価を生成中です..." });
      // 評価生成へ
      evaluateSessionMutation.mutate();
    },
  });

  const evaluateSessionMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("evaluateAvatarTrainingSession", {
        avatarConversationSessionId: sessionId,
      }),
    onSuccess: (res) => {
      setEvaluation(res.data.evaluation);
      toast({ title: "評価完了", description: "研修結果が評価されました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!input.trim() || !sessionId) return;
    const q = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    sendMessageMutation.mutate(q);
  };

  if (scenarios.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <PageHeader title="新人研修アバター" description="シナリオを選択して研修を開始します。" />
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">研修シナリオが登録されていません。</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader title="新人研修アバター" description="シナリオを選択して研修を開始します。" />

      {!sessionId && !evaluation ? (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">シナリオを選択</div>
          <div className="grid grid-cols-1 gap-3">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => setSelectedScenarioId(scenario.id)}
                className={`text-left p-4 rounded-lg border transition-all ${
                  selectedScenarioId === scenario.id
                    ? "bg-primary/10 border-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <h4 className="font-medium">{scenario.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">{scenario.description}</p>
                <div className="flex gap-2 mt-2">
                  {scenario.learningObjectives?.map((obj, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {obj}
                    </Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <Button
            onClick={() => startSessionMutation.mutate()}
            disabled={!selectedScenarioId || startSessionMutation.isPending}
            className="w-full gap-2 bg-primary hover:bg-primary/90"
          >
            {startSessionMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Play className="w-4 h-4" /> 研修を開始
              </>
            )}
          </Button>
        </div>
      ) : evaluation ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" /> 評価結果
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg p-6">
              <div className="text-center">
                <div className="text-5xl font-bold text-primary">{evaluation.evaluationScore}</div>
                <p className="text-sm text-muted-foreground mt-2">{evaluation.summary}</p>
              </div>
            </div>

            {evaluation.goodPoints?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" /> 良かった点
                </h4>
                <ul className="space-y-1">
                  {evaluation.goodPoints.map((point, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span>・</span> {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {evaluation.improvementPoints?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" /> 改善すべき点
                </h4>
                <ul className="space-y-1">
                  {evaluation.improvementPoints.map((point, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span>・</span> {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-xs text-muted-foreground">会社方針理解</p>
                <div className="text-lg font-semibold">{evaluation.companyPolicyUnderstanding}%</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">判断基準理解</p>
                <div className="text-lg font-semibold">{evaluation.decisionCriteriaUnderstanding}%</div>
              </div>
            </div>

            {evaluation.nextLearningItems?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold">次に学ぶこと</h4>
                <ul className="space-y-1">
                  {evaluation.nextLearningItems.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span>→</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {evaluation.needHumanReview && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-700">上長による確認が必要です。</p>
              </div>
            )}

            <Button
              onClick={() => {
                setSessionId(null);
                setEvaluation(null);
                setMessages([]);
                setSelectedScenarioId("");
              }}
              variant="outline"
              className="w-full"
            >
              別のシナリオを選択
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col" style={{ height: "500px" }}>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                    <Brain className="w-6 h-6 text-primary/50" />
                  </div>
                  <p className="text-sm text-muted-foreground">シナリオが始まります。</p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <Brain className="w-3.5 h-3.5 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[70%] rounded-xl px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 text-foreground"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <p>{msg.content}</p>
                      ) : (
                        <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1 [&>p:last-child]:mb-0">
                          {msg.answer}
                        </ReactMarkdown>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {sendMessageMutation.isPending && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Brain className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="bg-muted/60 rounded-xl px-4 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border p-3 flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="回答を入力..."
                rows={1}
                className="resize-none min-h-[40px] max-h-24 flex-1 text-sm"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || sendMessageMutation.isPending}
                className="shrink-0 h-9"
              >
                <span className="w-4 h-4">→</span>
              </Button>
            </div>
          </Card>

          <Button
            onClick={() => endSessionMutation.mutate()}
            disabled={endSessionMutation.isPending}
            variant="outline"
            className="w-full gap-2"
          >
            {endSessionMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "研修を終了して評価"
            )}
          </Button>
        </>
      )}
    </div>
  );
}