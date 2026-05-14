import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Save, Building2, Upload } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

const initialForm = {
  clientCompanyId: "",
  companyName: "",
  industry: "",
  description: "",
  foundedYear: "",
  ceo: "",
  employeeCount: "",
  headquarters: "",
  website: "",
  services: "",
  targetCustomer: "",
  tone: "professional",
  logoUrl: "",
};

export default function CompanyProfile() {
  const CLIENT_ID = useClientCompanyId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...initialForm, clientCompanyId: CLIENT_ID || "" });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (CLIENT_ID) {
      setForm((prev) => ({ ...prev, clientCompanyId: prev.clientCompanyId || CLIENT_ID }));
    }
  }, [CLIENT_ID]);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["companyProfile"],
    queryFn: () => base44.entities.CompanyProfile.filter({ clientCompanyId: CLIENT_ID }),
  });

  useEffect(() => {
    if (profiles.length > 0) {
      setForm({ ...initialForm, ...profiles[0] });
    }
  }, [profiles]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (profiles.length > 0) {
        return base44.entities.CompanyProfile.update(profiles[0].id, data);
      }
      return base44.entities.CompanyProfile.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companyProfile"] });
      toast({ title: "保存完了", description: "会社プロフィールを保存しました。" });
    },
  });

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    handleChange("logoUrl", file_url);
    setUploading(false);
  };

  const handleSave = () => saveMutation.mutate(form);

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <PageHeader
        title="会社プロフィール"
        description="AIが回答する際に参照する基本的な会社情報を登録します。"
        actions={
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
            <Save className="w-4 h-4" /> {saveMutation.isPending ? "保存中..." : "保存する"}
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Logo & Basic */}
        <Card className="p-6 space-y-5 bg-card border-border/50">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" /> 基本情報
          </h3>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-muted border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Upload className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">会社ロゴ</Label>
              <Input type="file" accept="image/*" onChange={handleLogoUpload} className="mt-1 max-w-xs" disabled={uploading} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">会社名 *</Label>
              <Input value={form.companyName} onChange={(e) => handleChange("companyName", e.target.value)} placeholder="例：SOFTDOING株式会社" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">業種</Label>
              <Input value={form.industry} onChange={(e) => handleChange("industry", e.target.value)} placeholder="例：IT・ソフトウェア" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">設立年</Label>
              <Input value={form.foundedYear} onChange={(e) => handleChange("foundedYear", e.target.value)} placeholder="例：2020年" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">代表者名</Label>
              <Input value={form.ceo} onChange={(e) => handleChange("ceo", e.target.value)} placeholder="例：山田太郎" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">従業員数</Label>
              <Input value={form.employeeCount} onChange={(e) => handleChange("employeeCount", e.target.value)} placeholder="例：50名" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">本社所在地</Label>
              <Input value={form.headquarters} onChange={(e) => handleChange("headquarters", e.target.value)} placeholder="例：東京都渋谷区..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Webサイト</Label>
              <Input value={form.website} onChange={(e) => handleChange("website", e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">AIの回答トーン</Label>
              <Select value={form.tone} onValueChange={(v) => handleChange("tone", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">フォーマル</SelectItem>
                  <SelectItem value="friendly">フレンドリー</SelectItem>
                  <SelectItem value="professional">プロフェッショナル</SelectItem>
                  <SelectItem value="casual">カジュアル</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ターゲット顧客</Label>
            <Input value={form.targetCustomer} onChange={(e) => handleChange("targetCustomer", e.target.value)} placeholder="例：中小企業のDX推進担当者" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">主要サービス・事業内容</Label>
            <Textarea value={form.services} onChange={(e) => handleChange("services", e.target.value)} placeholder="提供しているサービスや事業内容を詳しく記述..." rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">会社概要</Label>
            <Textarea value={form.description} onChange={(e) => handleChange("description", e.target.value)} placeholder="会社の概要を記述..." rows={4} />
          </div>
        </Card>
      </div>
    </div>
  );
}