import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Edit2, AlertTriangle, CheckCircle, Zap, Stethoscope,
  Activity, Archive, MoreVertical, Loader2
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

const statusColors = {
  draft: "bg-gray-100 text-gray-700",
  manual_id_required: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  inactive: "bg-red-100 text-red-700",
};

const consentColors = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  revoked: "bg-red-100 text-red-700",
};

export default function ExecutiveAvatarManagement() {
  const CLIENT_ID = useClientCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [newStatus, setNewStatus] = useState("");

  const { data: avatars = [], isLoading } = useQuery({
    queryKey: ["executiveAvatars", CLIENT_ID],
    queryFn: () =>
      base44.entities.ExecutiveAvatarProfile.filter({ clientCompanyId: CLIENT_ID }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ avatarId, newStatus }) =>
      base44.entities.ExecutiveAvatarProfile.update(avatarId, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["executiveAvatars"] });
      setShowDialog(false);
      toast({ title: "更新完了", description: "アバター状態が更新されました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const syncContextMutation = useMutation({
    mutationFn: ({ avatarId }) =>
      base44.functions.invoke("syncExecutiveAvatarContext", {
        clientCompanyId: CLIENT_ID,
        avatarProfileId: avatarId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["executiveAvatars"] });
      toast({ title: "同期完了", description: "Context が同期されました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const diagnosticMutation = useMutation({
    mutationFn: ({ avatarId }) =>
      base44.functions.invoke("debugExecutiveBrainIntegration", {
        clientCompanyId: CLIENT_ID,
        avatarProfileId: avatarId,
      }),
    onSuccess: (res) => {
      toast({
        title: "診断完了",
        description: res.data.message || "すべてのサービスが接続可能です。",
      });
    },
    onError: (err) => {
      toast({ title: "診断エラー", description: err.message, variant: "destructive" });
    },
  });

  const hasUnapprovedAvatars = avatars.some(a => a.consentStatus !== "approved");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="AIアバター管理"
        description="ExecutiveBrain Avatar のプロファイルを管理します。"
        actions={
          <Button onClick={() => setShowDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" /> 新規作成
          </Button>
        }
      />

      {hasUnapprovedAvatars && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900">本人同意が必要です</p>
            <p className="text-sm text-amber-700 mt-1">
              本人同意が承認されていないアバターは利用できません。
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <Card className="p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        </Card>
      ) : avatars.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-sm text-muted-foreground">アバターがまだ登録されていません。</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {avatars.map((avatar) => (
            <Card key={avatar.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* ヘッダー */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{avatar.avatarName}</h3>
                      <p className="text-sm text-muted-foreground">
                        {avatar.roleDescription || ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge className={consentColors[avatar.consentStatus]}>
                        {avatar.consentStatus === "approved" ? "✓" : "!"} 同意:{avatar.consentStatus}
                      </Badge>
                      <Badge className={statusColors[avatar.status]}>
                        {avatar.status}
                      </Badge>
                    </div>
                  </div>

                  {/* 詳細情報 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">対象スコープ</p>
                      <p className="font-medium">{avatar.audienceScope}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">HeyGen Avatar</p>
                      <p className="font-medium">{avatar.heygenAvatarId ? "✓" : "未設定"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">LiveAvatar</p>
                      <p className="font-medium">{avatar.liveAvatarAvatarId ? "✓" : "未設定"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Context ID</p>
                      <p className="font-medium">{avatar.liveAvatarContextId ? "✓" : "未設定"}</p>
                    </div>
                  </div>

                  {/* アクション */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => (window.location.href = `/avatar-consent/${avatar.id}`)}
                      className="gap-1 text-xs"
                    >
                      <Edit2 className="w-3 h-3" /> 同意・素材
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => (window.location.href = `/avatar-creation/${avatar.id}`)}
                      className="gap-1 text-xs"
                    >
                      <Zap className="w-3 h-3" /> ID設定
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncContextMutation.mutate({ avatarId: avatar.id })}
                      disabled={syncContextMutation.isPending || avatar.status !== "active"}
                      className="gap-1 text-xs"
                    >
                      <Activity className="w-3 h-3" /> Context同期
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => diagnosticMutation.mutate({ avatarId: avatar.id })}
                      disabled={diagnosticMutation.isPending}
                      className="gap-1 text-xs"
                    >
                      <Stethoscope className="w-3 h-3" /> 診断
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedAvatar(avatar);
                        setNewStatus(avatar.status);
                        setShowDialog(true);
                      }}
                      className="gap-1 text-xs ml-auto"
                    >
                      <MoreVertical className="w-3 h-3" /> 状態変更
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 状態変更ダイアログ */}
      <Dialog open={showDialog && selectedAvatar} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>アバター状態の変更</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm font-medium mb-2">状態を選択</p>
              <div className="space-y-2">
                {["draft", "manual_id_required", "active", "inactive"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setNewStatus(s)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                      newStatus === s
                        ? "bg-primary/10 border-primary text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
            >
              キャンセル
            </Button>
            <Button
              onClick={() =>
                statusMutation.mutate({
                  avatarId: selectedAvatar.id,
                  newStatus,
                })
              }
              disabled={statusMutation.isPending || newStatus === selectedAvatar?.status}
            >
              {statusMutation.isPending ? "更新中..." : "変更"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}