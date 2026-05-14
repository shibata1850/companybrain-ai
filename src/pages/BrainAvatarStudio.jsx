import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useClientCompanyId } from "@/lib/useClientCompanyId";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Send, Sparkles, ShieldCheck, MessageCircle,
  ClipboardCheck, Pencil, Loader2, AlertCircle, ArrowRight,
  VideoOff
} from "lucide-react";

/**
 * BrainAvatarStudio — Brain がいる状態で見える、主役の Studio 画面。
 * 左に既存 Sidebar（AppLayout 経由）、中央にアバター + 対話。
 *
 * - アバター = アップロードした動画をループ再生（HeyGen/LiveAvatar 接続前の暫定）
 * - チャット = askCompanyBrain 経由（その人の話し方を system prompt で表現）
 */
export default function BrainAvatarStudio() {
  const clientCompanyId = useClientCompanyId();
  const videoRef = useRef(null);
  const scrollRef = useRef(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [signedVideoUrl, setSignedVideoUrl] = useState(null);

  // 主役の Brain (最も新しいものを採用)
  const { data: persons = [] } = useQuery({
    queryKey: ["brain-persons", clientCompanyId],
    queryFn: () => base44.entities.BrainPerson.filter({ clientCompanyId }),
    enabled: !!clientCompanyId,
  });
  const primaryPerson = useMemo(() => {
    if (!persons || persons.length === 0) return null;
    // active 優先、無ければ最新
    const active = persons.find((p) => p.status === "active");
    if (active) return active;
    return [...persons].sort((a, b) =>
      String(b.created_date || "").localeCompare(String(a.created_date || ""))
    )[0];
  }, [persons]);

  // この Brain の動画素材
  const { data: assets = [] } = useQuery({
    queryKey: ["brain-assets-studio", primaryPerson?.id],
    queryFn: () => base44.entities.BrainSourceAsset.filter({ brainPersonId: primaryPerson.id }),
    enabled: !!primaryPerson?.id,
  });
  const primaryVideo = useMemo(() => {
    return (assets || [])
      .filter((a) => a.assetType === "video")
      .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];
  }, [assets]);

  // 同意ステータス
  const { data: consents = [] } = useQuery({
    queryKey: ["brain-consents", primaryPerson?.id],
    queryFn: () => base44.entities.BrainConsentRecord.filter({ brainPersonId: primaryPerson.id }),
    enabled: !!primaryPerson?.id,
  });
  const latestConsent = useMemo(() => {
    return (consents || [])
      .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];
  }, [consents]);
  const consentApproved = latestConsent?.consentStatus === "approved";

  // 方針候補（完成度スコア + 承認待ち表示）
  const { data: candidates = [] } = useQuery({
    queryKey: ["brain-candidates", primaryPerson?.id],
    queryFn: () => base44.entities.BrainPolicyCandidate.filter({ brainPersonId: primaryPerson.id }),
    enabled: !!primaryPerson?.id,
  });
  const approvedCount = candidates.filter((c) => c.status === "approved").length;
  const draftCount = candidates.filter((c) => c.status === "draft").length;

  // 完成度スコア
  const completeness = useMemo(() => {
    let score = 0;
    if (primaryPerson) score += 15;
    if (primaryVideo) score += 20;
    if (consentApproved) score += 25;
    if (approvedCount > 0) score += Math.min(40, approvedCount * 8);
    return Math.min(100, score);
  }, [primaryPerson, primaryVideo, consentApproved, approvedCount]);

  // 動画 file_uri → signed URL（プライベートファイルを再生するため）
  useEffect(() => {
    let cancelled = false;
    async function resolveUrl() {
      if (!primaryVideo?.fileUri) {
        setSignedVideoUrl(null);
        return;
      }
      try {
        const res = await base44.integrations.Core.CreateFileSignedUrl({
          file_uri: primaryVideo.fileUri,
          expires_in: 3600,
        });
        if (!cancelled) {
          setSignedVideoUrl(res?.signed_url || res?.signedUrl || null);
        }
      } catch (err) {
        console.error("[BrainAvatarStudio] Failed to resolve video URL:", err);
        if (!cancelled) setSignedVideoUrl(null);
      }
    }
    resolveUrl();
    return () => {
      cancelled = true;
    };
  }, [primaryVideo?.fileUri]);

  // チャットスクロール追従
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // 動画再生コントロール（送信時に play / 受信時に再生継続）
  const playVideoBriefly = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const sendMutation = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending || !primaryPerson || !clientCompanyId) return;

    // ユーザーメッセージ追加
    const newMessages = [...messages, { role: "user", text: trimmed, ts: Date.now() }];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    playVideoBriefly();

    try {
      // その人の話し方・価値観を system prompt として注入
      const personaPrompt = `
あなたは「${primaryPerson.fullName}」（${primaryPerson.roleTitle || "役職未設定"}）の AI アバターです。
本人の話し方・考え方・判断基準を最大限再現して回答してください。

【話し方の特徴】
${primaryPerson.speakingStyle || "（未登録 — まだ Brain Interview を行っていません。一般的な丁寧な話し方で答えてください）"}

【価値観】
${primaryPerson.valuesNote || "（未登録）"}

【担当領域】
${primaryPerson.expertiseDomain || "（未登録）"}

【強み分野】
${(primaryPerson.strengthFields || []).join("、") || "（未登録）"}

【重要な前提】
- あなたは AI アバターであり、本人そのものではありません。
- 重要な判断は必ず人間に最終確認を促してください。
- まだ会社方針が十分に蓄積されていない場合は、その旨を素直に伝えてください。
- 自然な日本語の話し言葉で、簡潔に答えてください。
`.trim();

      const fullQuestion = `[System Persona]\n${personaPrompt}\n\n[User]\n${trimmed}`;

      const res = await base44.functions.invoke("askCompanyBrain", {
        clientCompanyId,
        question: fullQuestion,
        channel: "internal",
      });
      const data = res?.data || res;
      const answer = data?.answer || "（回答が取得できませんでした）";

      const updated = [...newMessages, { role: "assistant", text: answer, ts: Date.now() }];
      setMessages(updated);
    } catch (err) {
      console.error("[BrainAvatarStudio] Chat failed:", err);
      setMessages([...newMessages, {
        role: "assistant",
        text: `（送信エラー: ${err?.message || "通信失敗"}）`,
        ts: Date.now(),
      }]);
    } finally {
      setSending(false);
    }
  };

  // primaryPerson が無いケース（理論的にはこの画面に来ない）
  if (!primaryPerson) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3 text-sm text-slate-600">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            Brain Person がまだ登録されていません。トップから動画をアップロードしてください。
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* ヘッダー: 主役 Brain のプロフィール */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-cyan-600 uppercase tracking-wider">
            <Brain className="w-3.5 h-3.5" />
            CompanyBrain Avatar Studio
          </div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            {primaryPerson.fullName}
            <Badge
              variant={primaryPerson.status === "active" ? "default" : "outline"}
              className="text-xs font-normal"
            >
              {primaryPerson.status === "active" ? "Active" : primaryPerson.status === "archived" ? "Archived" : "Draft"}
            </Badge>
          </h1>
          <p className="text-slate-500 text-sm">
            {primaryPerson.roleTitle || "役職未設定"}
            {primaryPerson.department ? ` ・ ${primaryPerson.department}` : ""}
            {primaryPerson.expertiseDomain ? ` ・ ${primaryPerson.expertiseDomain}` : ""}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/brain-builder/persons/${primaryPerson.id}/edit`}>
            <Pencil className="w-3.5 h-3.5 mr-1" />
            プロフィールを編集
          </Link>
        </Button>
      </div>

      {/* 同意未承認の警告 */}
      {!consentApproved && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">本人同意がまだ承認されていません</p>
            <p className="text-xs text-amber-800 mt-0.5">
              アバターを公式に運用するには、本人動画・音声・同意書をアップロードして管理者が承認する必要があります。
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link to={`/brain-builder/persons/${primaryPerson.id}/consent`}>
              同意管理へ <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      )}

      {/* メインレイアウト: 左 = アバター + 機能、右 = チャット */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左: アバター + アクション */}
        <div className="lg:col-span-2 space-y-4">
          {/* アバター動画 */}
          <Card className="overflow-hidden border-slate-200">
            <div className="relative bg-slate-900" style={{ aspectRatio: "9 / 16", maxHeight: 560 }}>
              {signedVideoUrl ? (
                <video
                  ref={videoRef}
                  src={signedVideoUrl}
                  className="absolute inset-0 w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                  <VideoOff className="w-10 h-10 mb-2 opacity-50" />
                  <span className="text-xs">動画読み込み中...</span>
                </div>
              )}
              {/* オーバーレイ: スピーキングインジケータ */}
              {sending && (
                <div className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-xs flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  考え中...
                </div>
              )}
              {/* 注釈 */}
              <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                <Badge className="bg-black/50 backdrop-blur-sm text-white border-0 text-[10px]">
                  AI Avatar Preview
                </Badge>
                <Badge className="bg-black/50 backdrop-blur-sm text-white border-0 text-[10px]">
                  本人ではありません
                </Badge>
              </div>
            </div>
          </Card>

          {/* Brain 完成度 */}
          <Card className="border-slate-200">
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Brain 完成度</p>
                <span className="text-2xl font-bold text-slate-900">{completeness}%</span>
              </div>
              <Progress value={completeness} className="h-2" />
              <div className="grid grid-cols-3 gap-3 text-center pt-2 border-t border-slate-100">
                <div>
                  <p className="text-[10px] uppercase text-slate-400 mb-0.5">承認済み</p>
                  <p className="text-lg font-bold text-emerald-600">{approvedCount}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400 mb-0.5">承認待ち</p>
                  <p className="text-lg font-bold text-amber-600">{draftCount}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400 mb-0.5">同意</p>
                  <p className="text-lg font-bold">
                    {consentApproved ? (
                      <ShieldCheck className="w-5 h-5 text-emerald-600 inline" />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* クイックアクション */}
          <Card className="border-slate-200">
            <CardContent className="pt-5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Brain を育てる
              </p>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link to={`/brain-builder/persons/${primaryPerson.id}/consent`}>
                  <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" />同意・素材を管理</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between" disabled={!consentApproved}>
                <Link to={`/brain-builder/persons/${primaryPerson.id}/use-cases`}>
                  <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" />活用方法を選ぶ</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between" disabled={!consentApproved}>
                <Link to={`/brain-builder/persons/${primaryPerson.id}/interview`}>
                  <span className="flex items-center gap-2"><MessageCircle className="w-4 h-4" />Brain Interview</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link to={`/brain-builder/persons/${primaryPerson.id}/policies`}>
                  <span className="flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4" />方針候補レビュー
                    {draftCount > 0 && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] ml-1">
                        {draftCount}
                      </Badge>
                    )}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 右: チャット */}
        <div className="lg:col-span-3">
          <Card className="border-slate-200 h-full flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">
                  {primaryPerson.fullName} と話す
                </p>
                <p className="text-xs text-slate-500">
                  会話を重ねるほど、その人の判断基準が会社の Brain として育ちます。
                </p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 min-h-[400px] max-h-[640px]">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-100 flex items-center justify-center">
                    <Brain className="w-7 h-7 text-cyan-600" />
                  </div>
                  <p className="text-sm max-w-sm">
                    {primaryPerson.fullName} さんに何でも聞いてみてください。
                    例：「お客様対応で大切にしていることは？」「新人にまず何を教えますか？」
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center pt-2 max-w-md">
                    {[
                      "あなたが大切にしている判断基準は？",
                      "新人にまず何を教えますか？",
                      "お客様対応で守ることは？",
                    ].map((q, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(q)}
                        className="text-[11px] px-3 py-1.5 rounded-full bg-slate-50 hover:bg-cyan-50 border border-slate-200 hover:border-cyan-300 text-slate-700 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                        m.role === "user"
                          ? "bg-cyan-600 text-white"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {primaryPerson.fullName} さんが考えています...
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 p-3 space-y-2">
              <Textarea
                placeholder={`${primaryPerson.fullName} さんに話しかける...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
                rows={2}
                className="resize-none"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    sendMutation();
                  }
                }}
              />
              <div className="flex justify-between items-center">
                <p className="text-[11px] text-slate-400">
                  Cmd / Ctrl + Enter で送信 ・ アバターは AI です。最終判断は人間が行います。
                </p>
                <Button onClick={sendMutation} disabled={!input.trim() || sending} size="sm">
                  <Send className="w-3.5 h-3.5 mr-1" />
                  送信
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
