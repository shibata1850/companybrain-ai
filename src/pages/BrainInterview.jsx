import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft, MessageCircle, Sparkles, AlertCircle,
  CheckCircle2, Loader2, ArrowRight, Brain
} from "lucide-react";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const QUESTION_TEMPLATES = {
  new_employee_training: [
    "新人にまず最初に教えるべき会社の基本姿勢は何ですか？",
    "新人がよく失敗する判断と、その正しい考え方を教えてください。",
    "新人が「これは上司に確認すべき」と判断すべき境界はどこですか？",
  ],
  sales_education: [
    "この会社らしい営業とは、どんなスタンスですか？",
    "値引きやサービス追加の判断基準を教えてください。",
    "提案書で必ず守るべきこと、絶対に書いてはいけないことは何ですか？",
  ],
  customer_support: [
    "顧客対応で絶対に守るべきことは何ですか？",
    "クレーム対応で譲ってよいこと・譲ってはいけないことを教えてください。",
    "謝罪が必要な状況と、毅然と説明すべき状況の境界はどこですか？",
  ],
  founder_judgment: [
    "この会社で一番大切にしている判断基準は何ですか？",
    "社員に任せてよい判断と、必ず確認が必要な判断の境界はどこですか？",
    "数字より大切にしている経営原則があれば教えてください。",
  ],
  succession: [
    "後継者にまず最初に伝えたい会社の文化は何ですか？",
    "決して変えてほしくない会社の本質は何ですか？",
    "次世代に「これは判断を任せたい」領域と「相談してほしい」領域を分けてください。",
  ],
  field_education: [
    "この現場で「これだけは絶対に守る」基準は何ですか？",
    "経験者と新人で判断が分かれやすい場面の正解を教えてください。",
    "ベテランが暗黙にやっている重要な確認手順を教えてください。",
  ],
  internal_rule: [
    "社内ルールで形骸化しがちなものと、その本来の趣旨を教えてください。",
    "例外運用が許される条件と禁止される条件を整理してください。",
  ],
  work_review: [
    "メールや提案書で「この会社らしさ」を判断する基準は何ですか？",
    "レビュー時に必ずチェックすべきリスクポイントを教えてください。",
  ],
  hiring_explanation: [
    "採用候補者に必ず伝えたい会社のカルチャーは何ですか？",
    "誤解されやすい会社の特徴と、その本当の意味を教えてください。",
  ],
  management_decision: [
    "経営判断で優先順位をつける時の基準を教えてください。",
    "短期と長期がぶつかる時の判断軸を教えてください。",
    "撤退判断・投資判断のフレームを教えてください。",
  ],
};

function buildSystemPrompt(person, useCases) {
  const useCaseLabels = useCases.map((u) => u.useCaseType).join(", ");
  return `
あなたは「${person.fullName}」（${person.roleTitle || "役職未設定"}）の Brain インタビュアーです。
このインタビューは、本人の判断基準・教育方針・価値観を会社の脳みそ（CompanyBrain Knowledge）として残すために行います。

【活用方法】
${useCaseLabels || "未指定"}

【話し方の特徴】
${person.speakingStyle || "簡潔で誠実"}

【価値観】
${person.valuesNote || "未指定"}

【インタビューのルール】
- 1回の応答で 1-2 質問だけ。長くしすぎない。
- 「なぜそう判断するのか」「どんな例外があるか」「境界はどこか」を必ず深掘り。
- 答えにくい場合は具体例を例示して聞き直す。
- 短くまとめた共感や要約も加える。
- 最後に「もう少し聞きたいことはありますか？」と促す。
- 必ず日本語で回答する。

回答はテキスト本文のみ。JSON ではない。
  `.trim();
}

export default function BrainInterview() {
  const { personId, sessionId: paramSessionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [me, setMe] = useState(null);
  const [sessionId, setSessionId] = useState(paramSessionId || null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { base44.auth.me().then(setMe).catch(() => {}); }, []);

  const { data: person } = useQuery({
    queryKey: ["brain-person", personId],
    queryFn: () => base44.entities.BrainPerson.get(personId),
    enabled: !!personId,
  });

  const { data: useCases = [] } = useQuery({
    queryKey: ["brain-usecases", personId],
    queryFn: () => base44.entities.BrainUseCase.filter({ brainPersonId: personId }),
    enabled: !!personId,
  });

  const { data: consents = [] } = useQuery({
    queryKey: ["brain-consents", personId],
    queryFn: () => base44.entities.BrainConsentRecord.filter({ brainPersonId: personId }),
    enabled: !!personId,
  });

  const consentApproved = useMemo(() => {
    const latest = (consents || [])
      .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];
    return latest?.consentStatus === "approved";
  }, [consents]);

  const { data: existingSession } = useQuery({
    queryKey: ["brain-session", sessionId],
    queryFn: () => base44.entities.BrainInterviewSession.get(sessionId),
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (existingSession?.transcriptJson) {
      try {
        const parsed = JSON.parse(existingSession.transcriptJson);
        if (Array.isArray(parsed)) setMessages(parsed);
      } catch (_e) { /* noop */ }
      if (existingSession.status === "completed") setCompleted(true);
    }
  }, [existingSession]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ensureSession = async () => {
    if (sessionId) return sessionId;
    const useCaseType = useCases?.[0]?.useCaseType || "";
    const created = await base44.entities.BrainInterviewSession.create({
      clientCompanyId: CLIENT_ID,
      brainPersonId: personId,
      useCaseId: useCases?.[0]?.id || undefined,
      useCaseType,
      mode: "text_chat",
      status: "in_progress",
      title: `${person?.fullName || "Brain"} - ${new Date().toLocaleDateString("ja-JP")}`,
      startedAt: new Date().toISOString(),
      turnCount: 0,
      transcriptJson: "[]",
      extractionStatus: "pending",
      interviewerUserId: me?.id || "",
    });
    setSessionId(created.id);
    return created.id;
  };

  const persistTranscript = async (sid, msgs) => {
    await base44.entities.BrainInterviewSession.update(sid, {
      transcriptJson: JSON.stringify(msgs),
      turnCount: msgs.filter((m) => m.role === "assistant").length,
    });
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      const trimmed = input.trim();
      if (!trimmed) throw new Error("質問または回答を入力してください");
      if (!consentApproved) throw new Error("同意が承認されていません");

      const sid = await ensureSession();
      const newMessages = [...messages, { role: "user", text: trimmed, ts: Date.now() }];
      setMessages(newMessages);
      setInput("");
      await persistTranscript(sid, newMessages);

      const sysPrompt = buildSystemPrompt(person, useCases);
      const fullQuestion = `[System] ${sysPrompt}\n\n[User] ${trimmed}`;

      // 既存の askCompanyBrain を流用（channel=internal で会社方針内回答）
      const res = await base44.functions.invoke("askCompanyBrain", {
        clientCompanyId: CLIENT_ID,
        question: fullQuestion,
        channel: "internal",
      });
      const data = res?.data || res;
      const answer = data?.answer || "（回答が取得できませんでした）";
      const updated = [...newMessages, { role: "assistant", text: answer, ts: Date.now() }];
      setMessages(updated);
      await persistTranscript(sid, updated);
      return updated;
    },
    onError: (err) => {
      toast({ title: "送信エラー", description: err?.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("セッションが存在しません");
      if (messages.length < 2) throw new Error("少なくとも 1 ターン以上の対話が必要です");

      setExtracting(true);
      await base44.entities.BrainInterviewSession.update(sessionId, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      const res = await base44.functions.invoke("extractBrainPolicyCandidates", {
        clientCompanyId: CLIENT_ID,
        brainInterviewSessionId: sessionId,
      });
      return res?.data || res;
    },
    onSuccess: (data) => {
      setExtracting(false);
      setCompleted(true);
      const count = data?.candidatesCreated ?? 0;
      toast({
        title: "インタビュー完了",
        description: `${count} 件の方針候補を抽出しました。レビュー画面で承認/却下してください。`,
      });
      navigate(`/brain-builder/persons/${personId}/policies`);
    },
    onError: (err) => {
      setExtracting(false);
      toast({ title: "抽出エラー", description: err?.message, variant: "destructive" });
    },
  });

  const suggestQuestions = useMemo(() => {
    const types = (useCases || []).map((u) => u.useCaseType);
    const all = [];
    for (const t of types) {
      for (const q of QUESTION_TEMPLATES[t] || []) all.push(q);
    }
    if (all.length === 0) {
      // フォールバック
      for (const q of QUESTION_TEMPLATES.founder_judgment) all.push(q);
    }
    return all.slice(0, 6);
  }, [useCases]);

  if (!person) return <div className="p-8 text-sm text-slate-500">読み込み中...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/brain-builder")}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Brain Builder へ戻る
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-cyan-600 uppercase tracking-wider">
          <MessageCircle className="w-4 h-4" />
          Step 4 / 5 — Brain Interview（テキスト版）
        </div>
        <h1 className="text-3xl font-bold text-slate-900">{person.fullName} に質問する</h1>
        <p className="text-slate-600">
          会話は会社の脳みそとして残ります。完了すると Gemini が方針候補を抽出し、人間が承認したものだけが正式 Knowledge になります。
        </p>
        <div className="text-xs text-slate-500">
          ※ Phase 1: テキストモード（TEXT_FALLBACK）。LiveAvatar 接続は次フェーズで実装します。
        </div>
      </div>

      {!consentApproved && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-900">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">同意が承認されていないため、対話を開始できません。</p>
            <p className="text-xs mt-1">
              先に同意管理画面で承認してください。
            </p>
          </div>
        </div>
      )}

      <Card className="border-slate-200">
        <CardContent className="pt-4 px-4">
          <div className="flex items-center gap-2 mb-3 text-xs text-slate-600">
            <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
            <span className="font-semibold">活用方法に基づくおすすめ質問:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestQuestions.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInput(q)}
                disabled={!consentApproved || completed}
                className="text-xs text-left px-3 py-1.5 rounded-full bg-slate-50 hover:bg-cyan-50 border border-slate-200 hover:border-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {q}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div ref={scrollRef} className="h-[480px] overflow-y-auto p-5 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                <Brain className="w-10 h-10 text-slate-300" />
                <p className="text-sm">まだ会話がありません。最初の質問を送ってみましょう。</p>
                <p className="text-xs">上のおすすめ質問をクリックすると入力欄に挿入されます。</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))
            )}
            {sendMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 応答生成中...
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-3 space-y-2">
            <Textarea
              placeholder="質問または回答を入力してください..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!consentApproved || completed || sendMutation.isPending}
              rows={3}
              className="resize-none"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  sendMutation.mutate();
                }
              }}
            />
            <div className="flex justify-between items-center">
              <div className="text-[11px] text-slate-500">
                {messages.filter((m) => m.role === "assistant").length} ターン経過
                <span className="mx-2">·</span>
                Cmd/Ctrl + Enter で送信
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => completeMutation.mutate()}
                  disabled={messages.length < 2 || completed || extracting}
                >
                  {extracting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                  完了して方針抽出へ
                </Button>
                <Button
                  size="sm"
                  onClick={() => sendMutation.mutate()}
                  disabled={!input.trim() || !consentApproved || completed || sendMutation.isPending}
                >
                  送信 <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {completed && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="font-semibold text-emerald-900 text-sm">インタビュー完了</p>
                <p className="text-xs text-emerald-800">方針候補レビュー画面で承認/却下してください。</p>
              </div>
            </div>
            <Button asChild>
              <a href={`/brain-builder/persons/${personId}/policies`}>方針候補レビューへ <ArrowRight className="w-4 h-4 ml-1" /></a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
