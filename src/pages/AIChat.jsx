import React, { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  Brain, Send, Loader2, ThumbsUp, ThumbsDown, AlertTriangle,
  CheckCircle2, BookOpen, BarChart2, Save, RotateCcw, User, Shield
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import PageHeader from "@/components/shared/PageHeader";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

const MODES = [
  { value: "public",     label: "社外向けAI",   color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  { value: "internal",   label: "社内向けAI",   color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  { value: "executive",  label: "経営者向けAI", color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  { value: "admin_test", label: "管理者テスト", color: "bg-destructive/10 text-destructive border-destructive/30" },
];

const CATEGORIES = [
  { value: "all", label: "カテゴリ指定なし" },
  { value: "company", label: "会社情報" },
  { value: "service", label: "サービス" },
  { value: "sales", label: "営業" },
  { value: "support", label: "サポート" },
  { value: "internal_rule", label: "社内ルール" },
  { value: "hr", label: "人事" },
  { value: "management", label: "経営" },
];

export default function AIChat() {
  const CLIENT_ID = useClientCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollRef = useRef(null);
  const [mode, setMode] = useState("internal"); // デフォルト: 社内向け
  const [category, setCategory] = useState("all");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [editingLogId, setEditingLogId] = useState(null);
  const [correctedAnswer, setCorrectedAnswer] = useState("");
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const isAdmin = user?.role === "admin";

  const chatMutation = useMutation({
    mutationFn: async (question) => {
      const res = await base44.functions.invoke("askCompanyBrain", {
        question,
        channel: mode,
        clientCompanyId: CLIENT_ID,
        category: category === "all" ? undefined : category,
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

  const saveRevisionMutation = useMutation({
    mutationFn: ({ logId, corrected }) =>
      base44.entities.ConversationLog.update(logId, {
        correctedAnswer: corrected,
        needHumanReview: false,
        feedback: "good",
      }),
    onSuccess: (_, { logId, corrected }) => {
      setMessages(prev =>
        prev.map(m => m.conversationLogId === logId ? { ...m, correctedAnswer: corrected, feedback: "good" } : m)
      );
      setEditingLogId(null);
      setCorrectedAnswer("");
      toast({ title: "修正回答を保存しました" });
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

  const currentMode = MODES.find(m => m.value === mode);

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-5 h-[calc(100vh-2rem)]">
      <PageHeader title="AIチャット" description="登録されたナレッジをもとにAIが回答します。" />

      {/* モード切替 */}
      <div className="flex flex-wrap gap-2">
        {MODES.map(m => (
          <button
            key={m.value}
            onClick={() => { setMode(m.value); setMessages([]); }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
              mode === m.value ? m.color + " shadow-sm" : "border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {m.value === "admin_test" && <Shield className="inline w-3 h-3 mr-1" />}
            {m.label}
          </button>
        ))}
        <div className="ml-auto">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder="カテゴリ指定" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* メッセージエリア */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-4">
              <Brain className="w-7 h-7 text-primary/50" />
            </div>
            <p className="text-sm font-medium mb-1">{currentMode?.label}</p>
            <p className="text-xs text-muted-foreground">質問を入力してください。</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <Brain className="w-4 h-4 text-primary" />
              </div>
            )}

            <div className={`max-w-[78%] space-y-2 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
              {/* メッセージ本文 */}
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
                  {/* メタバッジ行 */}
                  <div className="flex flex-wrap gap-2 items-center">
                    {msg.confidence != null && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <BarChart2 className="w-2.5 h-2.5" />
                        信頼度 {Math.round(msg.confidence * 100)}%
                      </Badge>
                    )}
                    {msg.needHumanReview && (
                      <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/30 text-amber-600 bg-amber-500/5">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        人間確認が必要
                      </Badge>
                    )}
                    {msg.feedback === "good" && (
                      <Badge variant="outline" className="gap-1 text-[10px] border-emerald-500/30 text-emerald-600 bg-emerald-500/5">
                        <CheckCircle2 className="w-2.5 h-2.5" /> 良い回答
                      </Badge>
                    )}
                  </div>

                  {/* 参照ナレッジ */}
                  {msg.usedSourceTitles?.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center">
                      <BookOpen className="w-3 h-3 text-muted-foreground shrink-0" />
                      {msg.usedSourceTitles.map((t, j) => (
                        <Badge key={j} variant="secondary" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  )}

                  {/* フィードバック + 管理者ボタン */}
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
                      {isAdmin && (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => { setEditingLogId(msg.conversationLogId); setCorrectedAnswer(msg.answer || ""); }}
                        >
                          <Save className="w-3 h-3" /> 修正回答として保存
                        </Button>
                      )}
                    </div>
                  )}

                  {/* 修正回答入力（管理者のみ） */}
                  {isAdmin && editingLogId === msg.conversationLogId && (
                    <Card className="p-3 border-primary/30 bg-primary/5 space-y-2">
                      <Label className="text-xs font-semibold">修正後の回答</Label>
                      <Textarea
                        value={correctedAnswer}
                        onChange={e => setCorrectedAnswer(e.target.value)}
                        rows={4}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => saveRevisionMutation.mutate({ logId: msg.conversationLogId, corrected: correctedAnswer })}
                          disabled={saveRevisionMutation.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3" /> 保存
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => setEditingLogId(null)}>
                          キャンセル
                        </Button>
                      </div>
                    </Card>
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
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <Card className="p-4 bg-card border-border/50">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
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
            placeholder={`[${currentMode?.label}] 質問を入力... (Shift+Enterで改行)`}
            rows={1}
            className="resize-none min-h-[44px] max-h-32 flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            className="shrink-0 gap-1"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}