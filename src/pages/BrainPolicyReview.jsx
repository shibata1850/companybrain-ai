import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft, ClipboardCheck, Check, X,
  ShieldCheck, FileCheck2
} from "lucide-react";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

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

const SCOPE_LABEL = {
  public: "社外公開可",
  internal: "社内向け",
  executive: "経営者向け",
  admin_only: "管理者専用（softdoing_admin のみ）",
};

function CandidateCard({ candidate, transcript, onApprove, onReject, processing, isAdmin }) {
  const [reviewerNote, setReviewerNote] = useState(candidate.reviewerNote || "");
  const [audienceScope, setAudienceScope] = useState(candidate.suggestedAudienceScope || "internal");
  const isDraft = candidate.status === "draft";

  const sourceTurnTexts = (candidate.sourceTurnIndexes || [])
    .map((i) => transcript?.[i])
    .filter(Boolean);

  return (
    <Card className={`border ${
      candidate.status === "approved" ? "border-emerald-200 bg-emerald-50/30" :
      candidate.status === "rejected" ? "border-slate-200 bg-slate-50/40" :
      "border-amber-200"
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">{CATEGORY_LABEL[candidate.category] || candidate.category}</Badge>
              {candidate.status === "approved" && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">approved</Badge>}
              {candidate.status === "rejected" && <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs">rejected</Badge>}
              {candidate.status === "draft" && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">draft</Badge>}
            </div>
            <CardTitle className="text-base text-slate-900">{candidate.title || "(無題)"}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white rounded-md p-3 border border-slate-100">
          {candidate.draftText}
        </div>

        {(candidate.suggestedTags || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {candidate.suggestedTags.map((t, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t}</span>
            ))}
          </div>
        )}

        {sourceTurnTexts.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
              根拠とした対話ターン ({sourceTurnTexts.length} 件)
            </summary>
            <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-slate-200">
              {sourceTurnTexts.map((t, i) => (
                <div key={i} className="text-slate-600">
                  <span className="text-slate-400 mr-1">[{t?.role === "user" ? "Q" : "A"}]</span>
                  <span className="line-clamp-2">{t?.text}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {isDraft && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">公開範囲</label>
                <Select value={audienceScope} onValueChange={setAudienceScope}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">{SCOPE_LABEL.public}</SelectItem>
                    <SelectItem value="internal">{SCOPE_LABEL.internal}</SelectItem>
                    <SelectItem value="executive">{SCOPE_LABEL.executive}</SelectItem>
                    {isAdmin && <SelectItem value="admin_only">{SCOPE_LABEL.admin_only}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">レビューコメント（任意）</label>
              <Textarea
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
                rows={2}
                className="text-xs"
                placeholder="承認時の補足や却下理由など"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReject(candidate.id, reviewerNote)}
                disabled={processing}
              >
                <X className="w-3.5 h-3.5 mr-1" />却下
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => onApprove(candidate.id, reviewerNote, audienceScope)}
                disabled={processing}
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                承認 → Knowledge化
              </Button>
            </div>
          </div>
        )}
        {!isDraft && (candidate.reviewerNote || candidate.reviewedBy) && (
          <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 space-y-1">
            {candidate.reviewerNote && <p>コメント: {candidate.reviewerNote}</p>}
            {candidate.reviewedAt && <p>処理日時: {new Date(candidate.reviewedAt).toLocaleString("ja-JP")}</p>}
            {candidate.approvedKnowledgeChunkId && (
              <p className="flex items-center gap-1 text-emerald-700">
                <FileCheck2 className="w-3 h-3" />
                KnowledgeChunk として登録済み
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BrainPolicyReview() {
  const { personId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("draft");

  useEffect(() => { base44.auth.me().then(setMe).catch(() => {}); }, []);

  const userBusinessRole = me?.businessRole || (me?.role === "admin" ? "softdoing_admin" : "");
  const isAdmin = userBusinessRole === "softdoing_admin" || me?.role === "admin";
  const canApprove = ["client_admin", "softdoing_admin"].includes(userBusinessRole) || me?.role === "admin";

  const { data: person } = useQuery({
    queryKey: ["brain-person", personId],
    queryFn: () => base44.entities.BrainPerson.get(personId),
    enabled: !!personId,
  });

  const { data: candidates = [], refetch } = useQuery({
    queryKey: ["brain-candidates", personId],
    queryFn: () => base44.entities.BrainPolicyCandidate.filter({ brainPersonId: personId }),
    enabled: !!personId,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["brain-sessions-for-person", personId],
    queryFn: () => base44.entities.BrainInterviewSession.filter({ brainPersonId: personId }),
    enabled: !!personId,
  });

  // セッション ID → transcript を Map にしておく
  const transcriptBySession = useMemo(() => {
    const m = {};
    for (const s of sessions || []) {
      try {
        m[s.id] = JSON.parse(s.transcriptJson || "[]");
      } catch (_e) {
        m[s.id] = [];
      }
    }
    return m;
  }, [sessions]);

  const draftList = candidates.filter((c) => c.status === "draft");
  const approvedList = candidates.filter((c) => c.status === "approved");
  const rejectedList = candidates.filter((c) => c.status === "rejected");

  const decisionMutation = useMutation({
    mutationFn: async ({ candidateId, decision, reviewerNote, audienceScope }) => {
      const res = await base44.functions.invoke("approveBrainPolicyCandidate", {
        clientCompanyId: CLIENT_ID,
        brainPolicyCandidateId: candidateId,
        decision,
        reviewerNote,
        audienceScope,
      });
      return res?.data || res;
    },
    onSuccess: (data, vars) => {
      toast({
        title: vars.decision === "approve" ? "承認しました" : "却下しました",
        description: vars.decision === "approve"
          ? `KnowledgeChunk として登録: scope=${data?.audienceScope}`
          : "ステータスを rejected に更新しました。",
      });
      queryClient.invalidateQueries({ queryKey: ["brain-candidates"] });
      refetch();
    },
    onError: (err) => {
      toast({ title: "処理失敗", description: err?.message, variant: "destructive" });
    },
  });

  const handleApprove = (candidateId, reviewerNote, audienceScope) =>
    decisionMutation.mutate({ candidateId, decision: "approve", reviewerNote, audienceScope });
  const handleReject = (candidateId, reviewerNote) =>
    decisionMutation.mutate({ candidateId, decision: "reject", reviewerNote });

  if (!person) return <div className="p-8 text-sm text-slate-500">読み込み中...</div>;

  const renderList = (list) => (
    list.length === 0 ? (
      <div className="text-center py-12 text-sm text-slate-500">候補がありません。</div>
    ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {list.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            transcript={transcriptBySession[c.brainInterviewSessionId]}
            onApprove={handleApprove}
            onReject={handleReject}
            processing={decisionMutation.isPending}
            isAdmin={isAdmin}
          />
        ))}
      </div>
    )
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/brain-builder")}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Brain Builder へ戻る
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-cyan-600 uppercase tracking-wider">
          <ClipboardCheck className="w-4 h-4" />
          Step 5 / 5 — 方針候補レビュー
        </div>
        <h1 className="text-3xl font-bold text-slate-900">{person.fullName} の方針候補</h1>
        <p className="text-slate-600">
          Gemini が抽出した会社方針の候補です。承認したものだけが KnowledgeChunk として正式に登録され、AI Chat / アバター相談で参照可能になります。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="pt-5">
            <p className="text-xs text-amber-700 uppercase tracking-wider font-semibold mb-1">承認待ち (draft)</p>
            <p className="text-2xl font-bold text-amber-900">{draftList.length}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-5">
            <p className="text-xs text-emerald-700 uppercase tracking-wider font-semibold mb-1">承認済み (Knowledge化)</p>
            <p className="text-2xl font-bold text-emerald-900">{approvedList.length}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-slate-50/40">
          <CardContent className="pt-5">
            <p className="text-xs text-slate-600 uppercase tracking-wider font-semibold mb-1">却下済み (rejected)</p>
            <p className="text-2xl font-bold text-slate-700">{rejectedList.length}</p>
          </CardContent>
        </Card>
      </div>

      {!canApprove && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-sm text-slate-700">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />
          <div>
            <p className="font-semibold">承認権限がありません</p>
            <p className="text-xs mt-1">この画面の承認/却下は client_admin / softdoing_admin が行います。あなたのロール: {userBusinessRole || "未設定"}</p>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="draft">承認待ち ({draftList.length})</TabsTrigger>
          <TabsTrigger value="approved">承認済み ({approvedList.length})</TabsTrigger>
          <TabsTrigger value="rejected">却下済み ({rejectedList.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="draft" className="mt-4">{renderList(draftList)}</TabsContent>
        <TabsContent value="approved" className="mt-4">{renderList(approvedList)}</TabsContent>
        <TabsContent value="rejected" className="mt-4">{renderList(rejectedList)}</TabsContent>
      </Tabs>

      <div className="flex justify-between pt-2">
        <Button variant="outline" asChild>
          <Link to={`/brain-builder/persons/${personId}/interview`}>← Brain Interview に戻る</Link>
        </Button>
        <Button asChild>
          <Link to="/brain-builder">Brain Builder に戻る</Link>
        </Button>
      </div>
    </div>
  );
}
