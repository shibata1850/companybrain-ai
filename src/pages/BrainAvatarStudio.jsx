import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useClientCompanyId } from "@/lib/useClientCompanyId";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  Brain, Send, Sparkles, MessageCircle, ClipboardCheck, Loader2,
  VideoOff, LogOut, Check, X
} from "lucide-react";

const CATEGORY_LABEL = {
  decisionPolicy: "判断基準",
  educationPolicy: "教育方針",
  salesPolicy: "営業方針",
  customerSupportPolicy: "顧客対応方針",
  escalationRules: "エスカレーション条件",
  forbiddenActions: "禁止事項",
  trainingFAQ: "新人研修Q&A",
  workReviewCriteria: "仕事レビュー基準",
  decisionExamples: "判断例",
};

export default function BrainAvatarStudio() {
  const clientCompanyId = useClientCompanyId();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const videoRef = useRef(null);
  const scrollRef = useRef(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [signedVideoUrl, setSignedVideoUrl] = useState(null);
  const [tab, setTab] = useState("chat");

  // 主役 Brain
  const { data: persons = [] } = useQuery({
    queryKey: ["brain-persons", clientCompanyId],
    queryFn: () => api.listBrainPersons(),
    enabled: !!clientCompanyId,
  });
  const primaryPerson = useMemo(() => {
    if (!persons || persons.length === 0) return null;
    const active = persons.find((p) => p.status === "active");
    return active || persons[0];
  }, [persons]);

  // 動画素材
  const { data: assets = [] } = useQuery({
    queryKey: ["brain-assets", primaryPerson?.id],
    queryFn: () => api.listBrainAssets(primaryPerson.id),
    enabled: !!primaryPerson?.id,
  });
  const primaryVideo = useMemo(() => {
    return (assets || []).find((a) => a.asset_type === "video") || null;
  }, [assets]);

  // 動画 signed URL
  useEffect(() => {
    let cancelled = false;
    async function resolveUrl() {
      if (!primaryVideo?.id) { setSignedVideoUrl(null); return; }
      try {
        const res = await api.getAssetSignedUrl(primaryVideo.id);
        if (!cancelled) setSignedVideoUrl(res?.signedUrl || null);
      } catch (err) {
        console.error("[Studio] signed url failed:", err);
        if (!cancelled) setSignedVideoUrl(null);
      }
    }
    resolveUrl();
    return () => { cancelled = true; };
  }, [primaryVideo?.id]);

  // 方針候補 (draft)
  const { data: draftCandidates = [] } = useQuery({
    queryKey: ["brain-policy-candidates", primaryPerson?.id, "draft"],
    queryFn: () => api.listPolicyCandidates(primaryPerson.id, "draft"),
    enabled: !!primaryPerson?.id,
  });
  const { data: approvedCandidates = [] } = useQuery({
    queryKey: ["brain-policy-candidates", primaryPerson?.id, "approved"],
    queryFn: () => api.listPolicyCandidates(primaryPerson.id, "approved"),
    enabled: !!primaryPerson?.id,
  });

  // 完成度
  const completeness = useMemo(() => {
    let score = 0;
    if (primaryPerson) score += 15;
    if (primaryVideo) score += 25;
    if (approvedCandidates.length > 0) score += Math.min(60, approvedCandidates.length * 10);
    return Math.min(100, score);
  }, [primaryPerson, primaryVideo, approvedCandidates.length]);

  // ===== チャット =====
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendChat = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending || !primaryPerson) return;
    const newMessages = [...messages, { role: "user", text: trimmed, ts: Date.now() }];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    videoRef.current?.play().catch(() => {});

    try {
      const res = await api.chat({ brainPersonId: primaryPerson.id, message: trimmed });
      setMessages([...newMessages, { role: "assistant", text: res?.answer || "(回答なし)", ts: Date.now() }]);
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", text: `(送信エラー: ${err?.message || "通信失敗"})`, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  // ===== Brain Interview =====
  const [interviewSession, setInterviewSession] = useState(null);
  const [interviewMessages, setInterviewMessages] = useState([]);
  const [interviewInput, setInterviewInput] = useState("");
  const [interviewSending, setInterviewSending] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const startInterview = async () => {
    try {
      const session = await api.startInterview({ brainPersonId: primaryPerson.id });
      setInterviewSession(session);
      setInterviewMessages([]);
    } catch (err) {
      toast({ title: "セッション開始に失敗しました", description: err?.message, variant: "destructive" });
    }
  };

  const sendInterviewTurn = async () => {
    if (!interviewInput.trim() || !interviewSession) return;
    setInterviewSending(true);
    const userMsg = interviewInput;
    setInterviewMessages((m) => [...m, { role: "user", text: userMsg, ts: Date.now() }]);
    setInterviewInput("");
    try {
      const res = await api.sendInterviewTurn(interviewSession.id, userMsg);
      setInterviewMessages((m) => [...m, { role: "assistant", text: res?.assistantMessage || "", ts: Date.now() }]);
      setInterviewSession(res.session);
    } catch (err) {
      toast({ title: "送信失敗", description: err?.message, variant: "destructive" });
    } finally {
      setInterviewSending(false);
    }
  };

  const completeInterview = async () => {
    if (!interviewSession) return;
    setExtracting(true);
    try {
      const res = await api.completeInterview(interviewSession.id);
      toast({
        title: "方針候補を抽出しました",
        description: `${res?.candidatesCreated ?? 0} 件の候補が作成されました。レビュータブで承認してください。`,
      });
      setInterviewSession(null);
      setInterviewMessages([]);
      queryClient.invalidateQueries({ queryKey: ["brain-policy-candidates"] });
      setTab("review");
    } catch (err) {
      toast({ title: "抽出失敗", description: err?.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  // ===== 方針候補レビュー =====
  const decideMutation = useMutation({
    mutationFn: ({ id, decision, audienceScope }) =>
      api.decidePolicy(id, { decision, audienceScope }),
    onSuccess: (_, vars) => {
      toast({ title: vars.decision === "approve" ? "承認しました" : "却下しました" });
      queryClient.invalidateQueries({ queryKey: ["brain-policy-candidates"] });
    },
    onError: (err) => toast({ title: "失敗", description: err?.message, variant: "destructive" }),
  });

  if (!primaryPerson) {
    return (
      <div className="p-8">
        <Card><CardContent className="pt-6">Brain Person が見つかりません。</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">CompanyBrain Avatar Studio</p>
              <p className="text-[11px] text-slate-500">{primaryPerson.full_name} · {primaryPerson.role_title || "役職未設定"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="w-3.5 h-3.5 mr-1" />ログアウト
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左: アバター + 完成度 */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="overflow-hidden border-slate-200">
            <div className="relative bg-slate-900" style={{ aspectRatio: "9 / 16", maxHeight: 560 }}>
              {signedVideoUrl ? (
                <video
                  ref={videoRef}
                  src={signedVideoUrl}
                  className="absolute inset-0 w-full h-full object-cover"
                  autoPlay loop muted playsInline
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                  <VideoOff className="w-10 h-10 mb-2 opacity-50" />
                  <span className="text-xs">動画を読み込み中...</span>
                </div>
              )}
              {sending && (
                <div className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-xs flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />考え中...
                </div>
              )}
              <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                <Badge className="bg-black/50 backdrop-blur-sm text-white border-0 text-[10px]">AI Avatar Preview</Badge>
                <Badge className="bg-black/50 backdrop-blur-sm text-white border-0 text-[10px]">本人ではありません</Badge>
              </div>
            </div>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Brain 完成度</p>
                <span className="text-2xl font-bold text-slate-900">{completeness}%</span>
              </div>
              <Progress value={completeness} className="h-2" />
              <div className="grid grid-cols-2 gap-3 text-center pt-2 border-t border-slate-100">
                <div>
                  <p className="text-[10px] uppercase text-slate-400 mb-0.5">承認済み</p>
                  <p className="text-lg font-bold text-emerald-600">{approvedCandidates.length}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400 mb-0.5">承認待ち</p>
                  <p className="text-lg font-bold text-amber-600">{draftCandidates.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右: タブ式 (対話 / インタビュー / レビュー) */}
        <div className="lg:col-span-3">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="chat" className="flex-1">
                <MessageCircle className="w-3.5 h-3.5 mr-1" />対話
              </TabsTrigger>
              <TabsTrigger value="interview" className="flex-1">
                <Sparkles className="w-3.5 h-3.5 mr-1" />Brain Interview
              </TabsTrigger>
              <TabsTrigger value="review" className="flex-1">
                <ClipboardCheck className="w-3.5 h-3.5 mr-1" />レビュー
                {draftCandidates.length > 0 && <Badge className="ml-2 bg-amber-100 text-amber-800 border-amber-200 text-[10px]">{draftCandidates.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {/* === 対話タブ === */}
            <TabsContent value="chat" className="mt-4">
              <Card className="border-slate-200">
                <div ref={scrollRef} className="p-5 space-y-3 min-h-[400px] max-h-[600px] overflow-y-auto">
                  {messages.length === 0 ? (
                    <div className="text-center text-sm text-slate-500 py-12">
                      <Brain className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                      <p>{primaryPerson.full_name} さんに話しかけてみてください。</p>
                      <div className="flex flex-wrap gap-2 justify-center pt-4">
                        {["大切にしている判断基準は？", "新人にまず何を教えますか？", "お客様対応で守ることは？"].map((q) => (
                          <button key={q} onClick={() => setInput(q)} className="text-[11px] px-3 py-1.5 rounded-full bg-slate-50 hover:bg-cyan-50 border border-slate-200 hover:border-cyan-300 text-slate-700 transition-colors">{q}</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-800"}`}>{m.text}</div>
                      </div>
                    ))
                  )}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="bg-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-500 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />考えています...
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 p-3 space-y-2">
                  <Textarea placeholder={`${primaryPerson.full_name} さんに話しかける...`} value={input} onChange={(e) => setInput(e.target.value)} disabled={sending} rows={2} className="resize-none" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); sendChat(); } }} />
                  <div className="flex justify-end">
                    <Button onClick={sendChat} disabled={!input.trim() || sending} size="sm"><Send className="w-3.5 h-3.5 mr-1" />送信</Button>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* === Brain Interview タブ === */}
            <TabsContent value="interview" className="mt-4">
              <Card className="border-slate-200">
                <CardContent className="pt-5">
                  {!interviewSession ? (
                    <div className="text-center py-8 space-y-4">
                      <Sparkles className="w-10 h-10 mx-auto text-cyan-500" />
                      <p className="text-sm text-slate-600 max-w-md mx-auto">Brain Interview を開始すると、AI インタビュアーがあなたから会社の判断基準・教育方針・営業方針などを引き出します。完了後、Gemini が方針候補を抽出します。</p>
                      <Button onClick={startInterview}>インタビューを開始</Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="max-h-[420px] overflow-y-auto space-y-3">
                        {interviewMessages.map((m, i) => (
                          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-800"}`}>{m.text}</div>
                          </div>
                        ))}
                        {interviewSending && (
                          <div className="flex justify-start">
                            <div className="bg-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />インタビュアーが考え中...</div>
                          </div>
                        )}
                      </div>
                      <Textarea placeholder="回答を入力..." value={interviewInput} onChange={(e) => setInterviewInput(e.target.value)} disabled={interviewSending} rows={3} className="resize-none" />
                      <div className="flex justify-between">
                        <Button variant="outline" size="sm" onClick={completeInterview} disabled={interviewMessages.length < 2 || extracting}>
                          {extracting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}完了して方針抽出
                        </Button>
                        <Button onClick={sendInterviewTurn} disabled={!interviewInput.trim() || interviewSending} size="sm"><Send className="w-3.5 h-3.5 mr-1" />送信</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* === レビュータブ === */}
            <TabsContent value="review" className="mt-4 space-y-3">
              {draftCandidates.length === 0 ? (
                <Card><CardContent className="pt-6 text-center text-sm text-slate-500">承認待ちの方針候補はありません。</CardContent></Card>
              ) : (
                draftCandidates.map((cand) => (
                  <Card key={cand.id} className="border-amber-200">
                    <CardContent className="pt-5 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{CATEGORY_LABEL[cand.category] || cand.category}</Badge>
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">draft</Badge>
                        <Badge variant="outline" className="text-xs">公開範囲: {cand.suggested_audience_scope}</Badge>
                      </div>
                      <p className="font-semibold text-slate-900">{cand.title || "(無題)"}</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-md">{cand.draft_text}</p>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => decideMutation.mutate({ id: cand.id, decision: "reject" })} disabled={decideMutation.isPending}><X className="w-3.5 h-3.5 mr-1" />却下</Button>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => decideMutation.mutate({ id: cand.id, decision: "approve", audienceScope: cand.suggested_audience_scope })} disabled={decideMutation.isPending}><Check className="w-3.5 h-3.5 mr-1" />承認 → Knowledge 化</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
              {approvedCandidates.length > 0 && (
                <details className="pt-2">
                  <summary className="text-xs text-slate-500 cursor-pointer">承認済み {approvedCandidates.length} 件を表示</summary>
                  <div className="space-y-2 mt-2">
                    {approvedCandidates.map((cand) => (
                      <Card key={cand.id} className="border-emerald-200 bg-emerald-50/30">
                        <CardContent className="pt-4 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">{CATEGORY_LABEL[cand.category] || cand.category}</Badge>
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">approved</Badge>
                          </div>
                          <p className="font-semibold text-sm">{cand.title}</p>
                          <p className="text-xs text-slate-600 whitespace-pre-wrap">{cand.draft_text}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </details>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
