import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { AlertCircle, Activity, Loader2, Check } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

export default function AvatarContextSync() {
  const { avatarId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncPreview, setSyncPreview] = useState(null);

  const { data: avatar, isLoading: avatarLoading } = useQuery({
    queryKey: ["avatar", avatarId],
    queryFn: () => base44.entities.ExecutiveAvatarProfile.get(avatarId),
    enabled: !!avatarId,
  });

  const { data: chunks = [] } = useQuery({
    queryKey: ["chunks", CLIENT_ID],
    queryFn: () =>
      base44.entities.KnowledgeChunk.filter({
        clientCompanyId: CLIENT_ID,
        status: "approved",
      }),
  });

  const { data: company } = useQuery({
    queryKey: ["company", CLIENT_ID],
    queryFn: () => base44.entities.ClientCompany.get(CLIENT_ID),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("syncExecutiveAvatarContext", {
        clientCompanyId: CLIENT_ID,
        avatarProfileId: avatarId,
      }),
    onSuccess: (res) => {
      setSyncPreview(res.data);
      queryClient.invalidateQueries({ queryKey: ["avatar"] });
      toast({ title: "同期完了", description: "Context が同期されました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  if (avatarLoading || !avatar) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const chunksByAudience = {
    public: chunks.filter((c) => c.audienceScope === "public").length,
    internal: chunks.filter((c) => c.audienceScope === "internal").length,
    executive: chunks.filter((c) => c.audienceScope === "executive").length,
    admin_only: chunks.filter((c) => c.audienceScope === "admin_only").length,
  };

  const scopeWarnings = [];
  if (
    avatar.audienceScope === "public" &&
    (chunksByAudience.internal > 0 ||
      chunksByAudience.executive > 0 ||
      chunksByAudience.admin_only > 0)
  ) {
    scopeWarnings.push("社外向けアバターに internal/executive/admin_only スコープが混在しています。");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" onClick={() => navigate("/avatar-management")} className="mb-4">
          ← 戻る
        </Button>
        <h1 className="text-2xl font-bold">CompanyBrain Context 同期</h1>
        <p className="text-sm text-muted-foreground">{avatar.avatarName}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">同期対象情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">会社情報</p>
            <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">企業名:</span> {company?.companyName}
              </div>
              <div>
                <span className="text-muted-foreground">ミッション:</span> {company?.mission}
              </div>
              <div>
                <span className="text-muted-foreground">値観:</span> {company?.values}
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">ナレッジ件数（対象スコープ別）</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(chunksByAudience).map(([scope, count]) => (
                <div key={scope} className="bg-muted/30 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-primary">{count}</div>
                  <p className="text-xs text-muted-foreground capitalize">{scope}</p>
                </div>
              ))}
            </div>
          </div>

          {avatar.liveAvatarContextId && (
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" /> LiveAvatar Context ID
              </p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 font-mono text-sm">
                {avatar.liveAvatarContextId}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                最終同期:
                {avatar.updated_date
                  ? new Date(avatar.updated_date).toLocaleString("ja-JP")
                  : "未同期"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {scopeWarnings.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-50 border border-yellow-200">
          <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-900">スコープに関する警告</p>
            {scopeWarnings.map((warning, i) => (
              <p key={i} className="text-sm text-yellow-700 mt-1">
                {warning}
              </p>
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={() => syncMutation.mutate()}
        disabled={syncMutation.isPending}
        className="w-full gap-2 bg-primary hover:bg-primary/90"
      >
        {syncMutation.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Activity className="w-4 h-4" /> Context を同期
          </>
        )}
      </Button>

      {syncPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">同期結果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-2">新しい Context ID</p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 font-mono text-sm break-all">
                {syncPreview.liveAvatarContextId}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Context Prompt プレビュー（先頭）</p>
              <div className="bg-muted/30 rounded-lg p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                {syncPreview.contextPrompt?.substring(0, 800)}...
              </div>
            </div>

            <p className="text-xs text-green-700 flex items-center gap-2">
              <Check className="w-3 h-3" /> Context が正常に同期されました。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}