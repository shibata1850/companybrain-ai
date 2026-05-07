import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Upload, FileText, Sparkles, Loader2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

const CLIENT_ID = "demo-company-001";

export default function KnowledgeUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: "", type: "text", content: "", scope: "all", tags: "" });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Knowledge.create({ ...data, clientCompanyId: CLIENT_ID, status: "pending" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      setForm({ title: "", type: "text", content: "", scope: "all", tags: "" });
      setFile(null);
      toast({ title: "登録完了", description: "ナレッジを登録しました。承認待ち状態です。" });
    },
  });

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!form.title) setForm(p => ({ ...p, title: f.name }));
    }
  };

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "資料の要約（日本語、200文字程度）" },
          key_points: { type: "array", items: { type: "string" }, description: "主要なポイント（日本語）" },
          faq: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                answer: { type: "string" },
              },
            },
            description: "FAQ（よくある質問と回答）",
          },
        },
      },
    });
    if (result.status === "success" && result.output) {
      const out = result.output;
      setForm(p => ({
        ...p,
        content: out.summary + "\n\n【主要ポイント】\n" + (out.key_points || []).map((k, i) => `${i + 1}. ${k}`).join("\n"),
        fileUrl: file_url,
      }));
      if (out.faq) {
        setForm(p => ({ ...p, extractedFaq: JSON.stringify(out.faq) }));
      }
      toast({ title: "抽出完了", description: "資料から情報を抽出しました。" });
    }
    setExtracting(false);
  };

  const handleUploadAndSave = async () => {
    setUploading(true);
    let fileUrl = form.fileUrl;
    if (file && !fileUrl) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      fileUrl = file_url;
    }
    createMutation.mutate({ ...form, fileUrl });
    setUploading(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <PageHeader title="ナレッジ資料アップロード" description="PDF、画像、CSV、テキストなどの資料をアップロードし、AIのナレッジとして登録します。" />

      <Card className="p-6 space-y-5 bg-card border-border/50">
        {/* File Upload Area */}
        <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
          <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground mb-3">ファイルをドラッグ＆ドロップ、またはクリックして選択</p>
          <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.txt" onChange={handleFileSelect} className="max-w-xs mx-auto" />
          {file && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-sm">{file.name}</span>
              <Button size="sm" variant="outline" onClick={handleExtract} disabled={extracting} className="ml-2 gap-1">
                {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                AI抽出
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">タイトル *</Label>
            <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="資料のタイトル" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">資料タイプ</Label>
            <Select value={form.type} onValueChange={(v) => setForm(p => ({ ...p, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="image">画像</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="text">テキスト</SelectItem>
                <SelectItem value="faq">FAQ</SelectItem>
                <SelectItem value="manual">マニュアル</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">公開範囲</Label>
            <Select value={form.scope} onValueChange={(v) => setForm(p => ({ ...p, scope: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="external">社外向け</SelectItem>
                <SelectItem value="internal">社内向け</SelectItem>
                <SelectItem value="executive">経営者向け</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">タグ（カンマ区切り）</Label>
            <Input value={form.tags} onChange={(e) => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="営業, FAQ, 製品..." />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">内容・抽出テキスト</Label>
          <Textarea
            value={form.content}
            onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))}
            placeholder="資料の内容をここに入力、またはAI抽出ボタンで自動抽出..."
            rows={8}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleUploadAndSave} disabled={uploading || createMutation.isPending || !form.title} className="gap-2">
            {(uploading || createMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
            ナレッジとして登録
          </Button>
        </div>
      </Card>
    </div>
  );
}