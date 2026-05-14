import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft, ShieldCheck, Upload, Video, Mic, FileText,
  Check, AlertCircle, X, Loader2, ArrowRight
} from "lucide-react";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const ASSET_META = {
  video: { label: "本人動画", icon: Video, mime: "video/*", description: "顔・口元が見える 30秒以上の動画。HeyGen Digital Twin 等のアバター作成に使用します。" },
  audio: { label: "本人音声", icon: Mic, mime: "audio/*", description: "声の特徴が分かる 30秒以上の音声。LiveAvatar / TTS 用ボイスに使用します。" },
  consent_document: { label: "同意書", icon: FileText, mime: "application/pdf,image/*", description: "本人署名済みの同意書（PDF または画像）。" },
};

function AssetUploadCard({ assetType, existing, onUpload, isUploading }) {
  const meta = ASSET_META[assetType];
  const Icon = meta.icon;
  const fileInputRef = React.useRef(null);

  return (
    <Card className="border-slate-200">
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-cyan-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="font-semibold text-slate-900">{meta.label}</p>
              {existing ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  <Check className="w-3 h-3 mr-1" />アップ済
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500">未アップ</Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-3">{meta.description}</p>
            {existing && (
              <div className="bg-slate-50 rounded-md p-2 text-xs text-slate-600 mb-3 truncate">
                {existing.originalFileName || existing.fileUri}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={meta.mime}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(assetType, file);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant={existing ? "outline" : "default"}
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
              {existing ? "差し替えアップロード" : "アップロード"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BrainSourceConsentUpload() {
  const { personId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [me, setMe] = useState(null);
  const [uploadingType, setUploadingType] = useState(null);
  const [consentForm, setConsentForm] = useState({
    consentScope: "internal_only",
    purposeNote: "",
    consentExpiresAt: "",
  });
  const [revokeReason, setRevokeReason] = useState("");

  useEffect(() => {
    base44.auth.me().then(setMe).catch(() => {});
  }, []);

  const { data: person } = useQuery({
    queryKey: ["brain-person", personId],
    queryFn: () => base44.entities.BrainPerson.get(personId),
    enabled: !!personId,
  });

  const { data: assets = [], refetch: refetchAssets } = useQuery({
    queryKey: ["brain-assets", personId],
    queryFn: () => base44.entities.BrainSourceAsset.filter({ brainPersonId: personId }),
    enabled: !!personId,
  });

  const { data: consents = [], refetch: refetchConsents } = useQuery({
    queryKey: ["brain-consents", personId],
    queryFn: () => base44.entities.BrainConsentRecord.filter({ brainPersonId: personId }),
    enabled: !!personId,
  });

  const latestConsent = (consents || [])
    .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];
  const consentApproved = latestConsent?.consentStatus === "approved";

  const latestAssetByType = (type) =>
    (assets || [])
      .filter((a) => a.assetType === type)
      .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];

  const userBusinessRole = me?.businessRole || (me?.role === "admin" ? "softdoing_admin" : "");
  const canApprove = ["client_admin", "softdoing_admin"].includes(userBusinessRole) || me?.role === "admin";

  const uploadMutation = useMutation({
    mutationFn: async ({ assetType, file }) => {
      setUploadingType(assetType);
      const uploadRes = await base44.integrations.Core.UploadPrivateFile({ file });
      const fileUri = uploadRes?.file_uri || uploadRes?.fileUri;
      if (!fileUri) throw new Error("アップロード結果に file_uri が含まれていません。");
      return base44.entities.BrainSourceAsset.create({
        clientCompanyId: CLIENT_ID,
        brainPersonId: personId,
        assetType,
        fileUri,
        originalFileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        uploadedBy: me?.id || "",
        uploadedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast({ title: "アップロードしました" });
      refetchAssets();
      setUploadingType(null);
    },
    onError: (err) => {
      toast({ title: "アップロード失敗", description: err?.message, variant: "destructive" });
      setUploadingType(null);
    },
  });

  const consentSubmitMutation = useMutation({
    mutationFn: async () => {
      const consentDoc = latestAssetByType("consent_document");
      const previousStatus = latestConsent?.consentStatus || "pending";
      return base44.entities.BrainConsentRecord.create({
        clientCompanyId: CLIENT_ID,
        brainPersonId: personId,
        consentStatus: "pending",
        consentScope: consentForm.consentScope,
        purposeNote: consentForm.purposeNote,
        consentExpiresAt: consentForm.consentExpiresAt || undefined,
        consentFileUri: consentDoc?.fileUri || undefined,
        actedBy: me?.email || me?.id || "",
        actedByRole: ["client_admin", "softdoing_admin"].includes(userBusinessRole) ? userBusinessRole : "client_admin",
        previousStatus,
        newStatus: "pending",
      });
    },
    onSuccess: () => {
      toast({
        title: "同意レコードを作成しました（pending）",
        description: "管理者が承認すると Brain Interview に進めます。",
      });
      refetchConsents();
    },
  });

  const consentDecisionMutation = useMutation({
    mutationFn: async (newStatus) => {
      const consentDoc = latestAssetByType("consent_document");
      const previousStatus = latestConsent?.consentStatus || "pending";
      const actedRole = ["client_admin", "softdoing_admin"].includes(userBusinessRole) ? userBusinessRole : "softdoing_admin";
      return base44.entities.BrainConsentRecord.create({
        clientCompanyId: CLIENT_ID,
        brainPersonId: personId,
        consentStatus: newStatus,
        consentScope: latestConsent?.consentScope || "internal_only",
        purposeNote: latestConsent?.purposeNote || "",
        consentExpiresAt: latestConsent?.consentExpiresAt || undefined,
        consentFileUri: consentDoc?.fileUri || latestConsent?.consentFileUri,
        revocationReason: newStatus === "revoked" ? revokeReason : undefined,
        actedBy: me?.email || me?.id || "",
        actedByRole: actedRole,
        previousStatus,
        newStatus,
      });
    },
    onSuccess: (_, newStatus) => {
      toast({
        title: newStatus === "approved" ? "同意を承認しました" : "同意を撤回しました",
        description: newStatus === "approved"
          ? "Brain Interview / アバター利用が可能になりました。"
          : "Brain Interview / アバター利用は即時停止されます。",
      });
      refetchConsents();
      setRevokeReason("");
    },
  });

  if (!person) {
    return <div className="p-8 text-sm text-slate-500">読み込み中...</div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/brain-builder")}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Brain Builder へ戻る
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-cyan-600 uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4" />
          Step 2 / 5 — 動画・音声・同意書アップロード
        </div>
        <h1 className="text-3xl font-bold text-slate-900">{person.fullName} の素材と同意管理</h1>
        <p className="text-slate-600">
          本人の動画・音声・同意書をアップロードします。同意が承認されるまで、Brain Interview とアバター利用はできません。
        </p>
      </div>

      <Card className="border-2 border-slate-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            現在の同意ステータス
            {consentApproved ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">approved</Badge>
            ) : latestConsent?.consentStatus === "revoked" ? (
              <Badge className="bg-red-100 text-red-700 border-red-200">revoked</Badge>
            ) : latestConsent?.consentStatus === "pending" ? (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200">pending</Badge>
            ) : (
              <Badge variant="outline">未登録</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {latestConsent && (
            <div className="text-xs text-slate-600 grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 rounded-md p-3">
              <div><span className="text-slate-500">スコープ：</span>{latestConsent.consentScope}</div>
              <div><span className="text-slate-500">期限：</span>{latestConsent.consentExpiresAt || "未設定"}</div>
              <div><span className="text-slate-500">処理者：</span>{latestConsent.actedBy || "—"}</div>
            </div>
          )}
          {latestConsent?.purposeNote && (
            <div className="text-xs text-slate-600">
              <span className="text-slate-500">目的：</span>{latestConsent.purposeNote}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.keys(ASSET_META).map((t) => (
          <AssetUploadCard
            key={t}
            assetType={t}
            existing={latestAssetByType(t)}
            onUpload={(assetType, file) => uploadMutation.mutate({ assetType, file })}
            isUploading={uploadingType === t}
          />
        ))}
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">同意申請（pending を作成）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>同意スコープ</Label>
              <Select value={consentForm.consentScope} onValueChange={(v) => setConsentForm((f) => ({ ...f, consentScope: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal_only">社内利用のみ</SelectItem>
                  <SelectItem value="external_only">社外利用のみ</SelectItem>
                  <SelectItem value="internal_and_external">社内 + 社外</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>同意有効期限</Label>
              <Input
                type="date"
                value={consentForm.consentExpiresAt}
                onChange={(e) => setConsentForm((f) => ({ ...f, consentExpiresAt: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>利用目的</Label>
            <Textarea
              rows={3}
              placeholder="例：新人研修における判断基準の伝達、社内向けの仕事相談アバターとしての利用、など"
              value={consentForm.purposeNote}
              onChange={(e) => setConsentForm((f) => ({ ...f, purposeNote: e.target.value }))}
            />
          </div>
          <Button
            onClick={() => consentSubmitMutation.mutate()}
            disabled={!latestAssetByType("consent_document") || consentSubmitMutation.isPending}
            variant="outline"
          >
            同意申請を作成（pending）
          </Button>
          {!latestAssetByType("consent_document") && (
            <p className="text-xs text-amber-700">同意書（PDF/画像）のアップロードが必要です。</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-600" />
            管理者による承認 / 撤回
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canApprove ? (
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-600 flex gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 text-slate-500 shrink-0" />
              この操作は client_admin / softdoing_admin が行います。あなたのロール: {userBusinessRole || "未設定"}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => consentDecisionMutation.mutate("approved")}
                  disabled={consentApproved || !latestConsent || consentDecisionMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check className="w-4 h-4 mr-1" />
                  同意を承認する
                </Button>
                {consentApproved && (
                  <div className="flex flex-1 gap-2">
                    <Input
                      placeholder="撤回理由（任意）"
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="destructive"
                      onClick={() => consentDecisionMutation.mutate("revoked")}
                      disabled={consentDecisionMutation.isPending}
                    >
                      <X className="w-4 h-4 mr-1" />
                      同意を撤回する
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500">
                ※ 撤回時は即時利用停止になります。Brain Interview / アバター利用 / Knowledge 化は新規実行できなくなります。
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between pt-2">
        <Button variant="outline" asChild>
          <Link to={`/brain-builder/persons/${personId}/edit`}>← 人物情報を編集</Link>
        </Button>
        <Button asChild disabled={!consentApproved}>
          <Link to={`/brain-builder/persons/${personId}/use-cases`}>
            次へ：活用方法を選ぶ <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
