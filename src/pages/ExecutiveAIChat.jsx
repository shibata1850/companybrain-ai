import React, { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Brain, Send, Loader2, RotateCcw, User,
  AlertTriangle, Shield, Target, TrendingUp, Users, BookOpen
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import PageHeader from "@/components/shared/PageHeader";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

const ALLOWED_ROLES = ["softdoing_admin", "client_admin", "executive"];

const USE_CASES = [
  { label: "経営判断の整理",           text: "経営判断のポイントと論点を整理してください" },
  { label: "サービス方針の確認",       text: "サービス方針の現状と今後の方向性を確認させてください" },
  { label: "価格判断の論点整理",       text: "価格設定に関する判断材料と論点を整理してください" },
  { label: "顧客対応の判断材料",       text: "顧客対応における判断材料を整理してください" },
  { label: "採用・教育方針の確認",     text: "採用・教育方針の現状と課題を確認させてください" },
  { label: "事業承継ナレッジの確認",   text: "事業承継に関するナレッジと注意点を確認させてください" },
];

// 経営者向け回答をセクション別に解析して表示するコンポーネント
function ExecutiveAnswerCard({ answer }) {
  const sections = [
    { key: "結論",               icon: Target,      color: "text-primary" },
    { key: "判断材料",           icon: BookOpen,    color: "text-emerald-600" },
    { key: "リスク",             icon: AlertTriangle, color: "text-amber-600" },
    { key: "推奨アクション",     icon: TrendingUp,  color: "text-blue-600" },
    { key: "人間確認が必要な点", icon: Shield,      color: "text-destructive" },
  ];

  // セクションを抽出するパーサー
  const parsed = {};
  let remaining = answer;

  sections.forEach(({ key }) => {
    // "**1. 結論**" or "## 結論" or "1. 結論" などのパターンに対応
    const regex = new RegExp(
      `(?:\\*{0,2}(?:\\d+\\.\\s*)?${key}\\*{0,2}|#{1,3}\\s*(?:\\d+\\.\\s*)?${key})\\s*[:\\n]([\\s\\S]*?)(?=(?:\\*{0,2}(?:\\d+\\.\\s*)?(?:${sections.map(s => s.key).join("|")})\\*{0,2}|#{1,3}\\s*(?:\\d+\\.\\s*)?(?:${sections.map(s => s.key).join("|")}))\\s*[:\\n]|$)`,
      "i"
    );
    const match = remaining.match(regex);
    if (match) {
      parsed[key] = match[1].trim();
    }
  });

  const hasSections = Object.keys(parsed).length >= 2;

  if (!hasSections) {
    return (
      <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0">
        {answer}
      </ReactMarkdown>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map(({ key, icon: Icon, color }) => {
        if (!parsed[key]) return null;
        return (
          <div key={key} className="space-y-1">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${color}`}>
              <Icon className="w-3.5 h-3.5" />
              {key}
            </div>
            <div className="pl-5 text-sm text-foreground/90 leading-relaxed">
              <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1 [&>p:last-child]:mb-0">
                {parsed[key]}
              </ReactMarkdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ExecutiveAIChat() {
  const CLIENT_ID = useClientCompanyId();
  const { toast } = useToast();
  const scrollRef = useRef(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => {
      const role = u?.businessRole || (u?.role === "admin" ? "softdoing_admin" : "viewer");
      if (!ALLOWED_ROLES.includes(role)) {
        setAccessDenied(true);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (question) => {
      const fullQuestion = `
以下の質問に対して、必ず次の5つのセクション形式で回答してください。
各セクションは見出し（例：**1. 結論**）で始めてください。

1. 結論
2. 判断材料
3. リスク
4. 推奨アクション
5. 人間確認が必要な点

質問: ${question}
      `.trim();

      const res = await base44.functions.invoke("askCompanyBrain", {
        clientCompanyId: CLIENT_ID,
        question: fullQuestion,
        channel: "executive",
      });
      return { ...res.data, originalQuestion: question };
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "assistant", ...data }]);
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;
    const q = input.trim();
    setMessages(prev => [...prev, { role: "user", content: q }]);
    setInput("");
    chatMutation.mutate(q);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (accessDenied) {
    return (
      <div className="p-8 max-w-xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Shield className="w-10 h-10 text-destructive mb-4" />
        <h2 className="text-lg font-semibold mb-2">アクセス権限がありません</h2>
        <p className="text-sm text-muted-foreground">経営者向けAIは経営者・管理者のみ利用できます。</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-5 h-[calc(100vh-2rem)]">
      <PageHeader
        title="経営者向けAI"
        description="経営判断の整理・方針確認・リスク評価を支援します。"
      />

      {/* 注意書き */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 leading-relaxed">
          このAIの回答は <strong>判断支援</strong> を目的としています。最終的な経営判断・意思決定は必ず人間が行ってください。
          法務・税務・労務・財務に関する事項は、専門家への相談を強く推奨します。
        </p>
      </div>

      {/* 用途ヒント */}
      <div className="flex flex-wrap gap-2">
        {USE_CASES.map(({ label, text }) => (
          <button
            key={label}
            onClick={() => setInput(text)}
            className="px-3 py-1.5 rounded-lg text-xs border border-dashed border-border text-muted-foreground hover:border-amber-500/40 hover:text-amber-700 transition-all"
          >
            {label}
          </button>
        ))}
      </div>

      {/* メッセージエリア */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/10 to-primary/10 flex items-center justify-center mb-4">
              <Brain className="w-7 h-7 text-amber-600/50" />
            </div>
            <p className="text-sm font-medium mb-1">経営者向けAI</p>
            <p className="text-xs text-muted-foreground">判断材料が必要な議題を入力してください。</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-1">
                <Brain className="w-4 h-4 text-amber-600" />
              </div>
            )}

            <div className={`max-w-[82%] space-y-2 flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <Card className={`p-4 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border/50"
              }`}>
                {msg.role === "user" ? (
                  <p>{msg.content}</p>
                ) : (
                  <ExecutiveAnswerCard answer={msg.answer || ""} />
                )}
              </Card>

              {msg.role === "assistant" && (
                <div className="flex flex-wrap gap-2 items-center">
                  {msg.confidence != null && (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      信頼度 {Math.round(msg.confidence * 100)}%
                    </Badge>
                  )}
                  {msg.needHumanReview && (
                    <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/30 text-amber-600 bg-amber-500/5">
                      <AlertTriangle className="w-2.5 h-2.5" /> 専門家確認を推奨
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {chatMutation.isPending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4 text-amber-600" />
            </div>
            <Card className="p-4 bg-card border-border/50 space-y-1">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                <span className="text-xs text-muted-foreground">分析中...</span>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* 入力エリア */}
      <div className="border-t border-border pt-4">
        <div className="flex gap-2 items-end">
          <Button size="icon" variant="ghost" className="shrink-0" onClick={() => setMessages([])}>
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="判断したい議題や確認したい方針を入力... (Shift+Enterで改行)"
            rows={1}
            className="resize-none min-h-[44px] max-h-32 flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            className="shrink-0 gap-1 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}