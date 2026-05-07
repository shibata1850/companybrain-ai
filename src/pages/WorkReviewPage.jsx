import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { AlertCircle, Send, Loader2, Check, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import ReactMarkdown from "react-markdown";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const WORK_TYPES = [
  { value: "email", label: "メール" },
  { value: "proposal", label: "提案書" },
  { value: "customer_response", label: "顧客対応" },
  { value: "report", label: "報告書" },
  { value: "presentation", label: "プレゼン" },
];

export default function WorkReviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    avatarId: "",
    title: "",
    workType: "email",
    inputText: "",
    reviewPurpose: "",
  });
  const [review, setReview] = useState(null);

  const { data: avatars = [] } = useQuery({
    queryKey: ["activeAvatars", CLIENT_ID],
    queryFn: () =>
      base44.entities.ExecutiveAvatarProfile.filter({
        clientCompanyId: CLIENT_ID,
        status: "active",
        consentStatus: "approved",
      }),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("reviewWorkWithExecutiveBrain", {
        clientCompanyId: CLIENT_ID,
        avatarProfileId: formData.avatarId,
        title: formData.title,
        workType: formData.workType,
        inputText: formData.inputText,
        reviewPurpose: formData.reviewPurpose,
      }),
    onSuccess: (res) => {
      setReview(res.data.review);
      toast({ title: "レビュー完了", description: "仕事がレビューされました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  if (avatars.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <PageHeader title="仕事レビュー" description="メールや提案書などをアバターがレビューします。" />
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">利用可能なアバターがありません。</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader title="仕事レビュー" description="メールや提案書などをアバターがレビューします。" />

      {!review ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">レビュー対象の入力</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">レビュー担当アバター</label>
                <Select value={formData.avatarId} onValueChange={(val) => setFormData({ ...formData, avatarId: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {avatars.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.avatarName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">対象タイプ</label>
                <Select value={formData.workType} onValueChange={(val) => setFormData({ ...formData, workType: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">タイトル</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例: 顧客への提案メール"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">レビュー目的</label>
              <Input
                value={formData.reviewPurpose}
                onChange={(e) => setFormData({ ...formData, reviewPurpose: e.target.value })}
                placeholder="例: 会社方針に沿っているか、リスクはないか"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">対象テキスト</label>
              <Textarea
                value={formData.inputText}
                onChange={(e) => setFormData({ ...formData, inputText: e.target.value })}
                placeholder="レビュー対象のテキストを貼り付けてください"
                rows={6}
              />
            </div>

            <Button
              onClick={() => reviewMutation.mutate()}
              disabled={
                !formData.avatarId || !formData.title || !formData.inputText || reviewMutation.isPending
              }
              className="w-full gap-2 bg-primary hover:bg-primary/90"
            >
              {reviewMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" /> レビューを依頼
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Button
            variant="outline"
            onClick={() => {
              setReview(null);
              setFormData({ avatarId: "", title: "", workType: "email", inputText: "", reviewPurpose: "" });
            }}
          >
            ← 別の内容をレビュー
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">総評</CardTitle>
            </CardHeader>
            <CardContent>
              <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">
                {review.overallReview}
              </ReactMarkdown>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">会社方針との整合性</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold text-primary">{review.companyPolicyFit}%</div>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${review.companyPolicyFit}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {review.riskPoints?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> リスク
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {review.riskPoints.map((risk, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span>⚠</span> {risk}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {review.improvementAdvice && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">改善アドバイス</CardTitle>
              </CardHeader>
              <CardContent>
                <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">
                  {review.improvementAdvice}
                </ReactMarkdown>
              </CardContent>
            </Card>
          )}

          {review.revisedDraft && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">修正文案</CardTitle>
              </CardHeader>
              <CardContent className="bg-muted/30 rounded-lg p-4">
                <p className="text-sm whitespace-pre-wrap">{review.revisedDraft}</p>
              </CardContent>
            </Card>
          )}

          {review.decisionCriteriaUsed?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">参照した判断基準</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {review.decisionCriteriaUsed.map((criteria, i) => (
                    <Badge key={i} variant="outline">
                      {criteria}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {review.referencedSources?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">参照した会社ナレッジ</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {review.referencedSources.map((source, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span>📄</span> {source}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {review.needHumanReview && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-50 border border-yellow-200">
              <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-900">人間確認が必要です</p>
                <p className="text-sm text-yellow-700 mt-1">
                  レビュー内容の最終確認を、マネージャーまたは責任者に依頼してください。
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}