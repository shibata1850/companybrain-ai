import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import BrainPersonSubNav from "@/components/BrainPersonSubNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2, Check, X, Inbox, ShieldCheck, Ban,
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

const SCOPE_OPTIONS = [
  { value: "public", label: "公開（全社員）" },
  { value: "internal", label: "社内限定（標準）" },
  { value: "executive", label: "経営層のみ" },
  { value: "admin_only", label: "管理者のみ（最上位）" },
];

const SCOPE_LABEL = Object.fromEntries(SCOPE_OPTIONS.map((s) => [s.value, s.label]));

const STATUS_TABS = [
  { value: "draft", label: "未承認" },
  { value: "approved", label: "承認済み" },
  { value: "rejected", label: "却下" },
];

export default function BrainPersonPolicies() {
  const { personId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("draft");

  const { data: person, isLoading: personLoading } = useQuery({
    queryKey: ["brain-person", personId],
    queryFn: () => api.getBrainPerson(personId),
    enabled: !!personId,
  });

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["brain-policies", personId, statusFilter],
    queryFn: () => api.listPolicyCandidates(personId, statusFilter),
    enabled: !!personId,
  });

  const decideMut = useMutation({
    mutationFn: ({ id, decision, reviewerNote, audienceScope }) =>
      api.decidePolicy(id, { decision, reviewerNote, audienceScope }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["brain-policies", personId] });
      toast({
        title: vars.decision === "approve" ? "承認しました" : "却下しました",
      });
    },
    onError: (err) => toast({
      title: "処理に失敗しました",
      description: err?.message || "通信エラーの可能性があります。",
      variant: "destructive",
    }),
  });

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

  const draftCount = statusFilter === "draft" ? candidates.length : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <BrainPersonSubNav person={person} active="policies" />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">方針承認</h1>
          <p className="text-sm text-slate-500 mt-1">
            インタビューから抽出された方針候補を承認・却下します。
            承認すると会社の正式な知識（Knowledge Chunks）として登録されます。
          </p>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-5">
          <TabsList>
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {t.value === "draft" && draftCount !== null && draftCount > 0 && (
                  <Badge className="ml-2 bg-cyan-600 text-white text-[10px]">{draftCount}</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />読み込み中...
          </div>
        )}

        {!isLoading && candidates.length === 0 && (
          <Card className="border-dashed border-slate-200">
            <CardContent className="py-16 text-center">
              <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">
                {statusFilter === "draft" && "承認待ちの方針候補はありません。"}
                {statusFilter === "approved" && "まだ承認済みの方針はありません。"}
                {statusFilter === "rejected" && "却下された候補はありません。"}
              </p>
              {statusFilter === "draft" && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => navigate(`/persons/${encodeURIComponent(personId)}/interview`)}
                >
                  インタビューを開始する
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {!isLoading && candidates.length > 0 && (
          <div className="space-y-4">
            {candidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                onDecide={(payload) => decideMut.mutate({ id: c.id, ...payload })}
                isPending={decideMut.isPending && decideMut.variables?.id === c.id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function CandidateCard({ candidate, onDecide, isPending }) {
  const [scope, setScope] = useState(candidate.suggested_audience_scope || "internal");
  const [note, setNote] = useState("");

  const isDraft = candidate.status === "draft";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
              {CATEGORY_LABEL[candidate.category] || candidate.category}
            </Badge>
            {candidate.suggested_tags?.slice(0, 4).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px] text-slate-500 border-slate-200">{t}</Badge>
            ))}
            {!isDraft && (
              <Badge
                className={
                  candidate.status === "approved"
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-100"
                }
              >
                {candidate.status === "approved" ? "承認済み" : "却下"}
              </Badge>
            )}
          </div>
          <div className="text-xs text-slate-400">
            {candidate.created_at && formatDate(candidate.created_at)}
          </div>
        </div>

        <h3 className="text-base font-semibold text-slate-900 mb-2">
          {candidate.title || "(無題)"}
        </h3>
        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed mb-4">
          {candidate.draft_text}
        </p>

        {!isDraft && candidate.reviewer_note && (
          <div className="text-xs text-slate-500 italic border-l-2 border-slate-200 pl-3 mb-3">
            レビューコメント: {candidate.reviewer_note}
          </div>
        )}

        {isDraft && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">公開範囲</label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {scope !== candidate.suggested_audience_scope && (
                  <div className="text-[11px] text-amber-700 mt-1">
                    AI 提案: {SCOPE_LABEL[candidate.suggested_audience_scope]}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">レビューコメント（任意）</label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="承認・却下の理由や修正メモなど"
                  className="resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onDecide({ decision: "reject", reviewerNote: note })}
                disabled={isPending}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Ban className="w-4 h-4 mr-1" />}
                却下
              </Button>
              <Button
                onClick={() => onDecide({ decision: "approve", reviewerNote: note, audienceScope: scope })}
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
                承認
              </Button>
            </div>
          </div>
        )}

        {!isDraft && (
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            {candidate.status === "approved" ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {candidate.reviewed_at && formatDate(candidate.reviewed_at)}
            {candidate.status === "approved" && ` · 公開: ${SCOPE_LABEL[candidate.suggested_audience_scope] || candidate.suggested_audience_scope}`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(iso) {
  try {
    const d = new Date(iso.replace(" ", "T") + "Z");
    return d.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}
