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
  ThumbsUp, ThumbsDown, BookmarkPlus, AlertCircle
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import PageHeader from "@/components/shared/PageHeader";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const CATEGORIES = [
  { value: "",              label: "すべて" },
  { value: "company",       label: "会社概要" },
  { value: "service",       label: "サービス" },
  { value: "sales",         label: "営業" },
  { value: "support",       label: "サポート" },
  { value: "internal_rule", label: "社内ルール" },
  { value: "hr",            label: "人事" },
  { value: "other",         label: "その他" },
];

const ALLOWED_ROLES = ["softdoing_admin", "client_admin", "editor", "employee"];

export default function InternalAIChat() {
  const { toast } = useToast();
  const scrollRef = useRef(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [category, setCategory] = useState("");
  const [user, setUser] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
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
      const res = await base44.functions.invoke("askCompanyBrain", {
        clientCompanyId: CLIENT_ID,
        question,
        channel: "internal",
        category: category || undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "assistant", ...data }]);
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ logId, feedback }) =>
      base44.entities.ConversationLog.update(logId, { feedback }),
    onSuccess: (_, { logId, feedback }) => {
      setMessages(prev =>
        prev.map(m => m.conversationLogId === logId ? { ...m, feedback } : m)
      );
      toast({ title: feedback === "good" ? "👍 フィードバック送信" : "📝 フィードバック送信" });
    },
  });

  const registerTrainingMutation = useMutation({
    mutationFn: async ({ question, answer, logId }) => {
      await base44.entities.KnowledgeChunk.create({
        clientCompanyId: CLIENT_ID,
        knowledgeSourceId: "training-qa",
        title: `研修Q&A: ${question.slice(0, 50)}`,
        chunkText: `Q: ${question}\nA: ${answer}`,
        category: category || "other",
        audienceScope: "internal",
        tags: ["新人研修", "Q&A"],
        keywords: [],
        status: "draft",
      });
      if (logId) {
        await base44.entities.ConversationLog.update(logId, { feedback: "good" });
      }
    },
    onSuccess: (_, { logId }) => {
      setMessages(prev =>
        prev.map(m => m.conversationLogId === logId ? { ...m, registeredAsTraining: true } : m)
      );
      toast({ title: "登録完了", description: "新人研修Q&Aに下書きとして登録しました。" });
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

  // アクセス拒否
  if (accessDenied) {
    return (
      <div className="p-8 max-w-xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <AlertCircle className="w-10 h-10 text-destructive mb-4" />
        <h2 className="text-lg font-semibold mb-2">アクセス権限がありません</h2>
        <p className="text-sm text-muted-foreground">社内向けAIは社員・編集者・管理者のみ利用できます。</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-5 h-[calc(100vh-2rem)]">
      <PageHeader
        title="社内向けAI"
        description="社員向けQ&A・社内ルール確認・営業トーク確認などに活用できます。"
      />

      {/* カテゴリフィルター */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => { setCategory(c.value); setMessages([]); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              category === c.value
                ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 shadow-sm"
                : "border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 用途ヒント */}
      <div className="flex flex-wrap gap-2">
        {["新入社員向けQ&A", "社内ルール確認", "サービス説明", "営業トーク確認", "顧客対応方針確認"].map(hint => (
          <button
            key={hint}
            onClick={() => setInput(hint + "について教えてください")}
            className="px-3 py-1 rounded-full text-[11px] border border-dashed border-border text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-700 transition-all"
          >
            {hint}
          </button>
        ))}
      </div>

      {/* メッセージエリア */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-primary/10 flex items-center justify-center mb-4">
              <Brain className="w-7 h-7 text-emerald-600/50" />
            </div>
            <p className="text-sm font-medium mb-1">社内向けAI</p>
            <p className="text-xs text-muted-foreground">カテゴリを選択して質問してください。</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-1">
                <Brain className="w-4 h-4 text-emerald-600" />
              </div>
            )}

            <div className={`max-w-[78%] space-y-2 flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <Card className={`p-4 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border/50"
              }`}>
                {msg.role === "user" ? (
                  <p>{msg.content}</p>
                ) : (
                  <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0">
                    {msg.answer}
                  </ReactMarkdown>
                )}
              </Card>

              {/* AI回答メタ情報 */}
              {msg.role === "assistant" && (
                <div className="space-y-2 w-full">
                  {msg.needHumanReview && (
                    <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/30 text-amber-600 bg-amber-500/5">
                      <AlertCircle className="w-2.5 h-2.5" /> 確認推奨
                    </Badge>
                  )}

                  {msg.conversationLogId && (
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm" variant="outline"
                        className={`h-7 text-xs gap-1 ${msg.feedback === "good" ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/5" : ""}`}
                        onClick={() => feedbackMutation.mutate({ logId: msg.conversationLogId, feedback: "good" })}
                        disabled={msg.feedback === "good"}
                      >
                        <ThumbsUp className="w-3 h-3" /> 良い回答
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className={`h-7 text-xs gap-1 ${msg.feedback === "needs_improvement" ? "border-amber-500/40 text-amber-600 bg-amber-500/5" : ""}`}
                        onClick={() => feedbackMutation.mutate({ logId: msg.conversationLogId, feedback: "needs_improvement" })}
                        disabled={msg.feedback === "needs_improvement"}
                      >
                        <ThumbsDown className="w-3 h-3" /> 改善が必要
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        className={`h-7 text-xs gap-1 ${msg.registeredAsTraining ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/5" : "border-blue-500/30 text-blue-600 hover:bg-blue-500/5"}`}
                        onClick={() => {
                          const userMsg = messages[i - 1];
                          registerTrainingMutation.mutate({
                            question: userMsg?.content || "",
                            answer: msg.answer || "",
                            logId: msg.conversationLogId,
                          });
                        }}
                        disabled={msg.registeredAsTraining || registerTrainingMutation.isPending}
                      >
                        <BookmarkPlus className="w-3 h-3" />
                        {msg.registeredAsTraining ? "登録済み" : "新人研修Q&Aに登録する"}
                      </Button>
                    </div>
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
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4 text-emerald-600" />
            </div>
            <Card className="p-4 bg-card border-border/50">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
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
            placeholder="質問を入力... (Shift+Enterで改行)"
            rows={1}
            className="resize-none min-h-[44px] max-h-32 flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            className="shrink-0 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}