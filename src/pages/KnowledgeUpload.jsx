import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Upload, FileText, Sparkles, Loader2, X, CheckCircle2, AlertCircle } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import ExtractionPreview from "@/components/knowledge/ExtractionPreview";

const CLIENT_ID = "demo-company-001";

const CATEGORY_OPTIONS = [
  { value: "company", label: "会社情報" },
  { value: "service", label: "サービス" },
  { value: "sales", label: "営業" },
  { value: "support", label: "サポート" },
  { value: "internal_rule", label: "社内ルール" },
  { value: "hr", label: "人事" },
  { value: "management", label: "経営" },
  { value: "other", label: "その他" },
];

const SCOPE_OPTIONS = [
  { value: "public", label: "公開（社外向け）", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  { value: "internal", label: "社内向け", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  { value: "executive", label: "経営者向け", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  { value: "admin_only", label: "管理者のみ", color: "bg-destructive/10 text-destructive border-destructive/20" },
];

const RISK_OPTIONS = [
  { value: "low", label: "低リスク", color: "text-emerald-600" },
  { value: "medium", label: "中リスク", color: "text-amber-600" },
  { value: "high", label: "高リスク", color: "text-destructive" },
];

const SOURCE_TYPE_MAP = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
  "text/csv": "csv",
  "text/plain": "text",
};

const initialForm = {
  title: "",
  sourceType: "text",
  category: "company",
  audienceScope: "internal",
  riskLevel: "low",
  tagInput: "",
  tags: [],
};

export default function KnowledgeUpload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [step, setStep] = useState("upload"); // "upload" | "review"

  const setField = (key, value) => setForm(p => ({ ...p, [key]: value }));

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFileUrl(null);
    setExtracted(null);
    setExtractedText("");
    const detectedType = SOURCE_TYPE_MAP[f.type] || "text";
    setForm(p => ({
      ...p,
      sourceType: detectedType,
      title: p.title || f.name.replace(/\.[^/.]+$/, ""),
    }));
  };

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFileUrl(file_url);

    const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: {
        type: "object",
        properties: {
          document_title: { type: "string" },
          summary: { type: "string" },
          key_points: {
            type: "array",
            items: { type: "string" },
          },
          faq_candidates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                answer: { type: "string" },
                recommended_scope: {
                  type: "string",
                  enum: ["public", "internal", "executive", "admin_only"],
                },
                source_quote: { type: "string" },
              },
            },
          },
          risk_notes: {
            type: "array",
            items: { type: "string" },
          },
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    });

    if (result.status === "success" && result.output) {
      const out = result.output;
      setExtracted(out);
      // タイトルが未入力ならdocument_titleで補完
      if (out.document_title && !form.title) {
        setField("title", out.document_title);
      }
      // 抽出タグがあれば追加（重複排除）
      if (out.tags?.length > 0) {
        setForm(p => ({
          ...p,
          tags: [...new Set([...p.tags, ...out.tags])],
          title: p.title || out.document_title || p.title,
        }));
      }
      setStep("review");
      toast({ title: "抽出完了", description: "資料の内容を解析しました。内容を確認して登録してください。" });
    } else {
      toast({ title: "抽出失敗", description: "ファイルの解析に失敗しました。", variant: "destructive" });
    }
    setExtracting(false);
  };

  const addTag = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = form.tagInput.trim().replace(/,$/, "");
      if (tag && !form.tags.includes(tag)) {
        setForm(p => ({ ...p, tags: [...p.tags, tag], tagInput: "" }));
      }
    }
  };
  const removeTag = (tag) => setForm(p => ({ ...p, tags: p.tags.filter(t => t !== tag) }));

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // 1. KnowledgeSource を作成
      const source = await base44.entities.KnowledgeSource.create(data);

      // 2. KnowledgeChunk を作成（key_points と faq_candidates から）
      const chunks = [];
      const ex = extracted;

      if (ex?.key_points?.length > 0) {
        ex.key_points.forEach((point, i) => {
          chunks.push({
            clientCompanyId: CLIENT_ID,
            knowledgeSourceId: source.id,
            title: `ポイント ${i + 1}: ${point.slice(0, 40)}`,
            chunkText: point,
            category: data.category,
            audienceScope: data.audienceScope,
            tags: data.tags,
            keywords: [],
            status: "draft",
          });
        });
      }

      if (ex?.faq_candidates?.length > 0) {
        ex.faq_candidates.forEach((faq) => {
          chunks.push({
            clientCompanyId: CLIENT_ID,
            knowledgeSourceId: source.id,
            title: `FAQ: ${faq.question?.slice(0, 50)}`,
            chunkText: `Q: ${faq.question}\nA: ${faq.answer}`,
            category: data.category,
            audienceScope: faq.recommended_scope || data.audienceScope,
            tags: data.tags,
            keywords: [],
            status: "draft",
          });
        });
      }

      if (chunks.length > 0) {
        await base44.entities.KnowledgeChunk.bulkCreate(chunks);
      }

      return source;
    },
    onSuccess: (source) => {
      queryClient.invalidateQueries({ queryKey: ["knowledgeSources"] });
      queryClient.invalidateQueries({ queryKey: ["knowledgeChunks"] });
      const chunkCount = (extracted?.key_points?.length || 0) + (extracted?.faq_candidates?.length || 0);
      setForm(initialForm);
      setFile(null);
      setFileUrl(null);
      setExtracted(null);
      setExtractedText("");
      setStep("upload");
      toast({
        title: "登録完了",
        description: `ナレッジを下書きとして保存しました（チャンク ${chunkCount} 件生成）。管理者が承認するとAIが使用できるようになります。`,
      });
    },
  });

  const handleSave = () => {
    createMutation.mutate({
      clientCompanyId: CLIENT_ID,
      title: form.title,
      sourceType: form.sourceType,
      category: form.category,
      audienceScope: form.audienceScope,
      riskLevel: form.riskLevel,
      tags: form.tags,
      fileUrl: fileUrl || null,
      extractedText: extractedText || null,
      summary: extracted?.summary || null,
      status: "draft",
      version: "1.0",
    });
  };

  const scopeInfo = SCOPE_OPTIONS.find(s => s.value === form.audienceScope);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <PageHeader
        title="ナレッジ資料アップロード"
        description="PDF・画像・CSV・テキストをアップロードし、AIがナレッジとして活用できる形式に変換します。"
      />

      <div className="space-y-5">
        {/* Step 1: ファイル選択 + メタ情報 */}
        <Card className="p-6 bg-card border-border/50">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">1</span>
            ファイルと基本情報
          </h3>

          {/* Drop zone */}
          <label className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors mb-5">
            <Upload className="w-9 h-9 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground mb-1">クリックしてファイルを選択</p>
            <p className="text-xs text-muted-foreground/60">PDF・PNG・JPG・CSV・TXT対応</p>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.txt" onChange={handleFileSelect} className="hidden" />
          </label>

          {file && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 mb-5">
              <FileText className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExtract}
                disabled={extracting}
                className="gap-1.5 shrink-0"
              >
                {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {extracting ? "解析中..." : "AI解析"}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs">タイトル *</Label>
              <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="資料のタイトル" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">カテゴリ</Label>
              <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">資料タイプ</Label>
              <Select value={form.sourceType} onValueChange={(v) => setField("sourceType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="image">画像</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="text">テキスト</SelectItem>
                  <SelectItem value="manual">マニュアル</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">公開範囲（audienceScope）</Label>
              <Select value={form.audienceScope} onValueChange={(v) => setField("audienceScope", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {scopeInfo && (
                <Badge variant="outline" className={`text-[10px] mt-1 ${scopeInfo.color}`}>{scopeInfo.label}</Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">リスクレベル</Label>
              <Select value={form.riskLevel} onValueChange={(v) => setField("riskLevel", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs">タグ（Enterまたはカンマで追加）</Label>
              <Input
                value={form.tagInput}
                onChange={(e) => setField("tagInput", e.target.value)}
                onKeyDown={addTag}
                placeholder="例: 営業, FAQ, サービス紹介..."
              />
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Step 2: 抽出結果確認 */}
        {step === "review" && extracted && (
          <Card className="p-6 bg-card border-border/50">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">2</span>
              抽出結果の確認
            </h3>
            <ExtractionPreview extracted={extracted} />
          </Card>
        )}

        {/* ステータス説明 */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/40 border border-border/50">
          <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            登録後は <strong>draft（下書き）</strong> 状態になります。管理者がナレッジ一覧から内容を確認し、
            <strong>approved（承認）</strong> に変更するとAIが回答に使用できるようになります。
          </div>
        </div>

        {/* 登録ボタン */}
        <div className="flex justify-end gap-3">
          <Button
            onClick={handleSave}
            disabled={!form.title || createMutation.isPending}
            className="gap-2 px-6"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            下書きとして登録
          </Button>
        </div>
      </div>
    </div>
  );
}