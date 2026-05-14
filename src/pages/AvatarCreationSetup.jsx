import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Loader2, Save, Zap, Stethoscope, MessageSquare } from "lucide-react";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

const CREATION_MODES = [
  {
    value: "manual_id_registration",
    label: "手動ID登録",
    description: "HeyGen/LiveAvatarで既に作成済みのIDを登録",
  },
  {
    value: "heygen_digital_twin_api",
    label: "HeyGen Digital Twin API",
    description: "HeyGenのDigital Twin Creation APIで自動作成（要契約）",
  },
  {
    value: "liveavatar_custom_avatar",
    label: "LiveAvatar Custom Avatar",
    description: "LiveAvatarで自動作成（要契約）",
  },
  {
    value: "recorded_lipsync_only",
    label: "録画型リップシンク",
    description: "HeyGenのリップシンク機能で既存動画を活用",
  },
];

export default function AvatarCreationSetup() {
  const CLIENT_ID = useClientCompanyId();
  const { avatarId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    creationMode: "manual_id_registration",
    heygenAvatarId: "",
    heygenVoiceId: "",
    liveAvatarAvatarId: "",
    liveAvatarVoiceId: "",
    liveAvatarContextId: "",
    liveAvatarLlmConfigurationId: "",
  });

  const { data: avatar, isLoading } = useQuery({
    queryKey: ["avatar", avatarId],
    queryFn: () => base44.entities.ExecutiveAvatarProfile.get(avatarId),
    enabled: !!avatarId,
  });

  useEffect(() => {
    if (avatar) {
      setFormData({
        creationMode: avatar.creationMode || "manual_id_registration",
        heygenAvatarId: avatar.heygenAvatarId || "",
        heygenVoiceId: avatar.heygenVoiceId || "",
        liveAvatarAvatarId: avatar.liveAvatarAvatarId || "",
        liveAvatarVoiceId: avatar.liveAvatarVoiceId || "",
        liveAvatarContextId: avatar.liveAvatarContextId || "",
        liveAvatarLlmConfigurationId: avatar.liveAvatarLlmConfigurationId || "",
      });
    }
  }, [avatar]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.ExecutiveAvatarProfile.update(avatarId, {
        ...formData,
        status: "active",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avatar"] });
      toast({ title: "保存完了", description: "アバター ID が登録されました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const diagnosticMutation = useMutation({
    mutationFn: () =>
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

  const syncContextMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("syncExecutiveAvatarContext", {
        clientCompanyId: CLIENT_ID,
        avatarProfileId: avatarId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avatar"] });
      toast({ title: "同期完了", description: "Context が同期されました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const testSessionMutation = useMutation({
    mutationFn: () =>
      base44.functions.invoke("startExecutiveAvatarSession", {
        clientCompanyId: CLIENT_ID,
        avatarProfileId: avatarId,
        purpose: "demo",
      }),
    onSuccess: (res) => {
      if (res.data.roomUrl) {
        window.open(res.data.roomUrl, "_blank", "width=800,height=600");
      } else {
        toast({ title: "セッション開始", description: "テスト会話を開始しました。" });
      }
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !avatar) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" onClick={() => navigate("/avatar-management")} className="mb-4">
          ← 戻る
        </Button>
        <h1 className="text-2xl font-bold">アバター作成・ID設定</h1>
        <p className="text-sm text-muted-foreground">{avatar.avatarName}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">作成モード選択</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CREATION_MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setFormData({ ...formData, creationMode: mode.value })}
              className={`w-full text-left p-4 rounded-lg border transition-all ${
                formData.creationMode === mode.value
                  ? "bg-primary/10 border-primary"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="font-medium">{mode.label}</div>
              <p className="text-sm text-muted-foreground mt-1">{mode.description}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {formData.creationMode === "manual_id_registration" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">手動ID登録</CardTitle>
            <p className="text-xs text-muted-foreground mt-2">
              HeyGen / LiveAvatarで作成済みのavatar_id、voice_id、context_idを登録してください。
              Digital Twin Creation APIが契約上利用できない場合は、この手動登録方式で運用できます。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: "heygenAvatarId", label: "HeyGen Avatar ID" },
                { key: "heygenVoiceId", label: "HeyGen Voice ID" },
                { key: "liveAvatarAvatarId", label: "LiveAvatar Avatar ID" },
                { key: "liveAvatarVoiceId", label: "LiveAvatar Voice ID" },
                { key: "liveAvatarContextId", label: "LiveAvatar Context ID" },
                { key: "liveAvatarLlmConfigurationId", label: "LiveAvatar LLM Config ID" },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <label className="text-sm font-medium">{label}</label>
                  <Input
                    value={formData[key]}
                    onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                    placeholder={`${label}を入力`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="gap-2 bg-green-600 hover:bg-green-700"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          IDを保存
        </Button>

        <Button
          onClick={() => diagnosticMutation.mutate()}
          disabled={diagnosticMutation.isPending}
          variant="outline"
          className="gap-2"
        >
          {diagnosticMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
          接続診断
        </Button>

        <Button
          onClick={() => syncContextMutation.mutate()}
          disabled={syncContextMutation.isPending}
          variant="outline"
          className="gap-2"
        >
          {syncContextMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Context同期
        </Button>

        <Button
          onClick={() => testSessionMutation.mutate()}
          disabled={testSessionMutation.isPending}
          variant="outline"
          className="gap-2"
        >
          {testSessionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
          テスト会話開始
        </Button>
      </div>
    </div>
  );
}