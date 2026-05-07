import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Sparkles, Loader2, Save, CheckCircle2, Edit3, Volume2, FileText } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import ScriptResult from "@/components/script/ScriptResult";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const PURPOSES = [
  { value: "company_intro", label: "会社紹介" },
  { value: "service_intro", label: "サービス紹介" },
  { value: "sales",         label: "営業用" },
  { value: "training",      label: "新入社員研修" },
  { value: "recruiting",    label: "採用" },
  { value: "faq",           label: "FAQ回答" },
];

const AUDIENCES = [
  { value: "partner",       label: "取引先" },
  { value: "prospect",      label: "見込み客" },
  { value: "new_employee",  label: "新入社員" },
  { value: "employee",      label: "既存社員" },
  { value: "executive",     label: "経営者" },
];

const DURATIONS = [
  { value: "30秒", label: "30秒" },
  { value: "60秒", label: "60秒" },
  { value: "90秒", label: "90秒" },
  { value: "3分",  label: "3分" },
];

const TONES = [
  { value: "sincere",  label: "誠実" },
  { value: "bright",   label: "明るい" },
  { value: "ceo",      label: "代表者風" },
  { value: "trainer",  label: "研修講師風" },
  { value: "sales",    label: "営業担当風" },
];

function OptionGroup({ label, options, value, onChange }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              value === opt.value
                ? "bg-primary/10 text-primary border-primary/40 shadow-sm"
                : "border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ScriptGenerator() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    purpose: "company_intro",
    audience: "prospect",
    duration: "60秒",
    tone: "sincere",
    additionalNotes: "",
  });
  const [result, setResult] = useState(null);
  const [savedProject, setSavedProject] = useState(null);

  const setField = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("generateVideoScript", {
        clientCompanyId: CLIENT_ID,
        ...form,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setSavedProject(null);
      toast({ title: "台本生成完了", description: "内容を確認して保存してください。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (scriptText) => {
      const purposeMap = { company_intro: "company_intro", service_intro: "service_intro", sales: "sales", training: "training", recruiting: "recruiting", faq: "other" };
      return await base44.entities.VideoProject.create({
        clientCompanyId: CLIENT_ID,
        title: result.title,
        purpose: purposeMap[form.purpose] || "other",
        script: scriptText,
        scriptStatus: "draft",
        status: "draft",
      });
    },
    onSuccess: (project) => {
      setSavedProject(project);
      toast({ title: "保存完了", description: "台本をVideoProjectに保存しました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      return await base44.entities.VideoProject.update(savedProject.id, {
        scriptStatus: "approved",
        status: "script_ready",
      });
    },
    onSuccess: (updated) => {
      setSavedProject(updated);
      toast({ title: "台本承認", description: "台本が承認されました。音声生成へ進めます。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const isFormValid = form.purpose && form.audience && form.duration && form.tone;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="台本生成"
        description="動画の目的・対象者・尺・話し方を選択してAIが台本を生成します。"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左: 入力フォーム */}
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              台本の設定
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <OptionGroup label="動画目的 *" options={PURPOSES} value={form.purpose} onChange={v => setField("purpose", v)} />
            <OptionGroup label="対象者 *" options={AUDIENCES} value={form.audience} onChange={v => setField("audience", v)} />
            <OptionGroup label="希望尺 *" options={DURATIONS} value={form.duration} onChange={v => setField("duration", v)} />
            <OptionGroup label="話し方 *" options={TONES} value={form.tone} onChange={v => setField("tone", v)} />

            <div className="space-y-2">
              <Label className="text-xs font-semibold">補足・要望（任意）</Label>
              <Textarea
                value={form.additionalNotes}
                onChange={e => setField("additionalNotes", e.target.value)}
                placeholder="例：製品Aの特長を中心に、価格には触れないでください"
                rows={3}
                className="text-sm resize-none"
              />
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => generateMutation.mutate()}
              disabled={!isFormValid || generateMutation.isPending}
            >
              {generateMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> 生成中...</>
                : <><Sparkles className="w-4 h-4" /> AIで台本を生成</>
              }
            </Button>
          </CardContent>
        </Card>

        {/* 右: 生成結果 */}
        <div className="space-y-4">
          {!result && !generateMutation.isPending && (
            <Card className="border-border/50 border-dashed flex items-center justify-center" style={{ minHeight: "400px" }}>
              <div className="text-center py-12">
                <Sparkles className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">設定を選択して台本を生成してください</p>
              </div>
            </Card>
          )}

          {generateMutation.isPending && (
            <Card className="border-border/50 flex items-center justify-center" style={{ minHeight: "400px" }}>
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">台本を生成しています...</p>
              </div>
            </Card>
          )}

          {result && !generateMutation.isPending && (
            <ScriptResult
              result={result}
              savedProject={savedProject}
              onSave={(text) => saveMutation.mutate(text)}
              onApprove={() => approveMutation.mutate()}
              isSaving={saveMutation.isPending}
              isApproving={approveMutation.isPending}
              onProjectUpdate={(data) => setSavedProject(p => ({ ...p, ...data }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}