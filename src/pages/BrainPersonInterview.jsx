import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import BrainPersonSubNav from "@/components/BrainPersonSubNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Plus, Send, Sparkles, Loader2, ClipboardCheck, MessageSquare,
  User, Bot, CheckCircle2, AlertTriangle,
} from "lucide-react";

const USE_CASE_OPTIONS = [
  { value: "general", label: "（指定なし）" },
  { value: "decisionPolicy", label: "判断基準" },
  { value: "educationPolicy", label: "教育方針" },
  { value: "salesPolicy", label: "営業方針" },
  { value: "customerSupportPolicy", label: "顧客対応方針" },
  { value: "escalationRules", label: "エスカレーション条件" },
  { value: "forbiddenActions", label: "禁止事項" },
];

const STATUS_BADGE = {
  in_progress: { label: "進行中", className: "bg-cyan-100 text-cyan-700" },
  completed: { label: "完了", className: "bg-emerald-100 text-emerald-700" },
  abandoned: { label: "中断", className: "bg-slate-100 text-slate-500" },
};

export default function BrainPersonInterview() {
  const { personId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeSessionId, setActiveSessionId] = useState(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [useCaseType, setUseCaseType] = useState("general");
  const scrollRef = useRef(null);

  const { data: person, isLoading: personLoading } = useQuery({
    queryKey: ["brain-person", personId],
    queryFn: () => api.getBrainPerson(personId),
    enabled: !!personId,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["brain-interviews", personId],
    queryFn: () => api.listInterviews(personId),
    enabled: !!personId,
  });

  // Pick the most recent in-progress as default
  useEffect(() => {
    if (activeSessionId || sessions.length === 0) return;
    const inProgress = sessions.find((s) => s.status === "in_progress");
    setActiveSessionId((inProgress || sessions[0]).id);
  }, [sessions, activeSessionId]);

  const { data: activeSession } = useQuery({
    queryKey: ["brain-interview", activeSessionId],
    queryFn: () => api.getInterview(activeSessionId),
    enabled: !!activeSessionId,
  });

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeSession?.transcript?.length]);

  const startMut = useMutation({
    mutationFn: () =>
      api.startInterview({
        brainPersonId: personId,
        useCaseType: useCaseType === "general" ? null : useCaseType,
      }),
    onSuccess: (s) => {
      setActiveSessionId(s.id);
      queryClient.invalidateQueries({ queryKey: ["brain-interviews", personId] });
    },
    onError: (err) => toast({
      title: "セッション開始に失敗しました",
      description: err?.message || "通信エラーの可能性があります。",
      variant: "destructive",
    }),
  });

  const turnMut = useMutation({
    mutationFn: (text) => api.sendInterviewTurn(activeSessionId, text),
    onSuccess: () => {
      setDraftMessage("");
      queryClient.invalidateQueries({ queryKey: ["brain-interview", activeSessionId] });
    },
    onError: (err) => toast({
      title: "送信に失敗しました",
      description: err?.message || "Gemini API キーが設定されているか確認してください。",
      variant: "destructive",
    }),
  });

  const completeMut = useMutation({
    mutationFn: () => api.completeInterview(activeSessionId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["brain-interviews", personId] });
      queryClient.invalidateQueries({ queryKey: ["brain-interview", activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ["brain-policies", personId] });
      const n = res?.candidatesCreated ?? 0;
      toast({
        title: `方針候補を ${n} 件 抽出しました`,
        description: n > 0 ? "「方針承認」タブで内容を確認してください。" : "対話量が少ないため抽出されませんでした。",
      });
    },
    onError: (err) => toast({
      title: "抽出に失敗しました",
      description: err?.message || "通信エラーの可能性があります。",
      variant: "destructive",
    }),
  });

  const sortedSessions = useMemo(() => {
    const order = { in_progress: 0, completed: 1, abandoned: 2 };
    return [...sessions].sort((a, b) => {
      const oa = order[a.status] ?? 99;
      const ob = order[b.status] ?? 99;
      if (oa !== ob) return oa - ob;
      return (b.started_at || "").localeCompare(a.started_at || "");
    });
  }, [sessions]);

  if (personLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!person) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-slate-500">Brain Person が見つかりません。</p>
        <Button variant="outline" onClick={() => navigate("/")}>一覧へ戻る</Button>
      </div>
    );
  }

  const transcript = activeSession?.transcript || [];
  const isInProgress = activeSession?.status === "in_progress";
  const canComplete = isInProgress && transcript.length > 0;
  const onSend = () => {
    const t = draftMessage.trim();
    if (!t || !isInProgress) return;
    turnMut.mutate(t);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <BrainPersonSubNav person={person} active="interview" />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
              テキストインタビュー
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              AI が深掘り質問を投げかけ、対話履歴から方針候補を抽出します。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={useCaseType} onValueChange={setUseCaseType}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USE_CASE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => startMut.mutate()} disabled={startMut.isPending}>
              {startMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              新しいセッション
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sessions list */}
          <Card className="lg:col-span-1 h-fit">
            <CardContent className="p-3">
              <div className="text-xs font-semibold text-slate-500 px-2 py-1 mb-1">
                セッション
              </div>
              {sessionsLoading && (
                <div className="text-xs text-slate-400 px-2 py-3">読み込み中...</div>
              )}
              {!sessionsLoading && sortedSessions.length === 0 && (
                <div className="text-xs text-slate-400 px-2 py-3">
                  まだセッションがありません。「新しいセッション」から始めてください。
                </div>
              )}
              <div className="space-y-1">
                {sortedSessions.map((s) => {
                  const badge = STATUS_BADGE[s.status] || STATUS_BADGE.in_progress;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setActiveSessionId(s.id)}
                      className={`w-full text-left rounded-md px-2 py-2 text-sm transition-colors ${
                        activeSessionId === s.id
                          ? "bg-slate-100 text-slate-900"
                          : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate flex-1">{s.title || "(untitled)"}</span>
                        <Badge className={`${badge.className} text-[10px]`}>{badge.label}</Badge>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {s.turn_count} ターン
                        {s.extraction_status === "completed" && " · 抽出済"}
                        {s.extraction_status === "failed" && " · 抽出失敗"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Active chat */}
          <Card className="lg:col-span-3 flex flex-col" style={{ minHeight: 520 }}>
            {!activeSession ? (
              <CardContent className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 py-16">
                <MessageSquare className="w-10 h-10 mb-3" />
                <p className="text-sm">左のリストからセッションを選ぶか、新しく開始してください。</p>
              </CardContent>
            ) : (
              <>
                <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {activeSession.title || "(untitled)"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {activeSession.use_case_type ? `テーマ: ${activeSession.use_case_type}` : "テーマ未指定"}
                      · {activeSession.turn_count} ターン
                    </div>
                  </div>
                  {isInProgress ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => completeMut.mutate()}
                      disabled={!canComplete || completeMut.isPending}
                    >
                      {completeMut.isPending
                        ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        : <ClipboardCheck className="w-4 h-4 mr-1" />}
                      完了して方針を抽出
                    </Button>
                  ) : activeSession.extraction_status === "completed" ? (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/persons/${encodeURIComponent(personId)}/policies`)}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      方針承認へ
                    </Button>
                  ) : activeSession.extraction_status === "failed" ? (
                    <div className="flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="w-4 h-4" />
                      抽出失敗
                    </div>
                  ) : null}
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50/50" style={{ maxHeight: "60vh" }}>
                  {transcript.length === 0 && (
                    <div className="text-center text-slate-400 text-sm py-12">
                      <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      最初のメッセージを送ると、AI が深掘りの質問を返します。
                    </div>
                  )}
                  {transcript.map((m, i) => <MessageBubble key={i} msg={m} />)}
                  {turnMut.isPending && (
                    <div className="flex items-center gap-2 text-slate-400 text-sm pl-1">
                      <Bot className="w-4 h-4" />
                      <Loader2 className="w-3 h-3 animate-spin" />
                      考えています...
                    </div>
                  )}
                </div>

                {isInProgress && (
                  <div className="border-t border-slate-100 p-3">
                    <div className="flex gap-2 items-end">
                      <Textarea
                        value={draftMessage}
                        onChange={(e) => setDraftMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            onSend();
                          }
                        }}
                        rows={2}
                        placeholder="質問への回答、または話したいテーマを入力 (Cmd/Ctrl+Enter で送信)"
                        className="resize-none"
                      />
                      <Button
                        onClick={onSend}
                        disabled={!draftMessage.trim() || turnMut.isPending}
                      >
                        {turnMut.isPending
                          ? <Loader2 className="w-4 h-4" />
                          : <Send className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-slate-800 text-white rounded-br-sm"
            : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
        }`}
      >
        {msg.text}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-slate-600" />
        </div>
      )}
    </div>
  );
}
