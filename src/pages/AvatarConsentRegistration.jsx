import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Save, Check, X, AlertCircle, Loader2 } from "lucide-react";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

export default function AvatarConsentRegistration() {
  const { avatarId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    personName: "",
    roleTitle: "",
    avatarName: "",
    avatarType: "digital",
    avatarPurpose: "training",
    personalityGuide: "",
    decisionStyle: "",
    speakingTone: "",
    allowedUseCases: "",
    forbiddenUseCases: "",
    publicUseAllowed: false,
    internalUseAllowed: true,
    executiveUseAllowed: false,
    consentExpiresAt: "",
  });
  const [files, setFiles] = useState({
    consentFile: null,
    sourceVideo: null,
    sourceAudio: null,
  });

  const { data: avatar, isLoading } = useQuery({
    queryKey: ["avatar", avatarId],
    queryFn: () => base44.entities.ExecutiveAvatarProfile.get(avatarId),
    enabled: !!avatarId,
  });

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (avatar) {
      setFormData({
        personName: avatar.personName || "",
        roleTitle: avatar.roleTitle || "",
        avatarName: avatar.avatarName || "",
        avatarType: avatar.avatarType || "digital",
        avatarPurpose: avatar.avatarPurpose || "training",
        personalityGuide: avatar.personalityGuide || "",
        decisionStyle: avatar.decisionStyle || "",
        speakingTone: avatar.speakingTone || "",
        allowedUseCases: avatar.allowedUseCases || "",
        forbiddenUseCases: avatar.forbiddenUseCases || "",
        publicUseAllowed: avatar.publicUseAllowed || false,
        internalUseAllowed: avatar.internalUseAllowed !== false,
        executiveUseAllowed: avatar.executiveUseAllowed || false,
        consentExpiresAt: avatar.consentExpiresAt || "",
      });
    }
  }, [avatar]);

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const response = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
        file,
      });
      return response.file_uri;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const consentUri = files.consentFile
        ? await uploadMutation.mutateAsync(files.consentFile)
        : avatar?.consentFileUri;
      const videoUri = files.sourceVideo
        ? await uploadMutation.mutateAsync(files.sourceVideo)
        : avatar?.sourceVideoUri;
      const audioUri = files.sourceAudio
        ? await uploadMutation.mutateAsync(files.sourceAudio)
        : avatar?.sourceAudioUri;

      await base44.asServiceRole.entities.ExecutiveAvatarProfile.update(avatarId, {
        ...formData,
        consentFileUri: consentUri,
        sourceVideoUri: videoUri,
        sourceAudioUri: audioUri,
        consentStatus: "approved",
      });

      await base44.asServiceRole.entities.AvatarConsentAuditLog.create({
        clientCompanyId: CLIENT_ID,
        avatarProfileId: avatarId,
        personName: formData.personName,
        action: "approved",
        actionBy: user?.email,
        actionByRole: user?.role === "admin" ? "softdoing_admin" : "client_admin",
        consentFileUri: consentUri,
        sourceVideoUri: videoUri,
        sourceAudioUri: audioUri,
        previousStatus: avatar?.consentStatus,
        newStatus: "approved",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avatar"] });
      toast({ title: "承認完了", description: "アバター情報が保存されました。" });
      navigate("/avatar-management");
    },
  });

  if (isLoading || !avatar) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isApprovalEligible = user && ["admin", "softdoing_admin", "client_admin"].includes(user.role);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" onClick={() => navigate("/avatar-management")} className="mb-4">
          ← 戻る
        </Button>
        <h1 className="text-2xl font-bold">同意・素材登録</h1>
        <p className="text-sm text-muted-foreground">
          {avatar.avatarName} - {formData.personName}
        </p>
      </div>

      {avatar.consentStatus !== "approved" && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-50 border border-yellow-200">
          <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-900">本人同意が未承認です</p>
            <p className="text-sm text-yellow-700 mt-1">
              承認されるまで、このアバターは利用できません。
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">本人名</label>
              <Input
                value={formData.personName}
                onChange={(e) => setFormData({ ...formData, personName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">役職</label>
              <Input
                value={formData.roleTitle}
                onChange={(e) => setFormData({ ...formData, roleTitle: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">アバター名</label>
              <Input
                value={formData.avatarName}
                onChange={(e) => setFormData({ ...formData, avatarName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">有効期限</label>
              <Input
                type="date"
                value={formData.consentExpiresAt}
                onChange={(e) => setFormData({ ...formData, consentExpiresAt: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">アバターの性格・指針</label>
            <Textarea
              value={formData.personalityGuide}
              onChange={(e) => setFormData({ ...formData, personalityGuide: e.target.value })}
              placeholder="アバターの性格、話し方、判断スタイルなど"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">利用許可範囲</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.publicUseAllowed}
                  onChange={(e) => setFormData({ ...formData, publicUseAllowed: e.target.checked })}
                />
                <span className="text-sm">社外公開</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.internalUseAllowed}
                  onChange={(e) => setFormData({ ...formData, internalUseAllowed: e.target.checked })}
                />
                <span className="text-sm">社内向け</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.executiveUseAllowed}
                  onChange={(e) => setFormData({ ...formData, executiveUseAllowed: e.target.checked })}
                />
                <span className="text-sm">経営判断支援</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">素材アップロード</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "consentFile", label: "本人同意書", accept: ".pdf,.jpg,.png" },
            { key: "sourceVideo", label: "本人動画", accept: ".mp4,.mov,.webm" },
            { key: "sourceAudio", label: "音声素材", accept: ".mp3,.wav,.m4a" },
          ].map(({ key, label, accept }) => (
            <div key={key} className="space-y-2">
              <label className="text-sm font-medium">{label}</label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept={accept}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setFiles({ ...files, [key]: file });
                  }}
                  className="flex-1"
                />
                {files[key] && (
                  <Badge variant="outline" className="gap-1">
                    <Check className="w-3 h-3" /> {files[key].name}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => navigate("/avatar-management")}>
          キャンセル
        </Button>
        {isApprovalEligible && (
          <Button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            承認して保存
          </Button>
        )}
      </div>
    </div>
  );
}