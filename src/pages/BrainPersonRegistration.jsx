import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Brain, ArrowLeft, Save, ShieldCheck } from "lucide-react";
import { useClientCompanyId } from "@/lib/useClientCompanyId";

const STRENGTH_PRESETS = [
  "判断基準", "価格交渉", "クレーム対応", "人材育成", "品質管理",
  "営業戦略", "顧客対応", "組織運営", "事業承継", "現場教育",
];

const ROLE_OPTIONS = [
  { value: "founder", label: "代表者・創業者" },
  { value: "executive", label: "役員" },
  { value: "department_head", label: "部門長" },
  { value: "sales_lead", label: "営業責任者" },
  { value: "factory_lead", label: "工場長・現場長" },
  { value: "shop_lead", label: "店長" },
  { value: "hr_lead", label: "人事責任者" },
  { value: "veteran", label: "熟練社員・職人" },
  { value: "support_lead", label: "サポート責任者" },
  { value: "custom", label: "その他（自由記述）" },
];

export default function BrainPersonRegistration() {
  const CLIENT_ID = useClientCompanyId();
  const { personId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!personId;

  const [form, setForm] = useState({
    fullName: "",
    roleTitle: "",
    department: "",
    expertiseDomain: "",
    strengthFields: [],
    speakingStyle: "",
    valuesNote: "",
    internalUseAllowed: true,
    externalUseAllowed: false,
    notes: "",
    status: "draft",
  });

  const [rolePreset, setRolePreset] = useState("custom");

  const { data: person } = useQuery({
    queryKey: ["brain-person", personId],
    queryFn: () => base44.entities.BrainPerson.get(personId),
    enabled: isEdit,
  });

  useEffect(() => {
    if (person) {
      setForm({
        fullName: person.fullName || "",
        roleTitle: person.roleTitle || "",
        department: person.department || "",
        expertiseDomain: person.expertiseDomain || "",
        strengthFields: person.strengthFields || [],
        speakingStyle: person.speakingStyle || "",
        valuesNote: person.valuesNote || "",
        internalUseAllowed: person.internalUseAllowed !== false,
        externalUseAllowed: !!person.externalUseAllowed,
        notes: person.notes || "",
        status: person.status || "draft",
      });
    }
  }, [person]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.fullName.trim()) {
        throw new Error("氏名は必須です");
      }
      const payload = {
        clientCompanyId: CLIENT_ID,
        ...form,
      };
      if (isEdit) {
        return base44.entities.BrainPerson.update(personId, payload);
      }
      return base44.entities.BrainPerson.create(payload);
    },
    onSuccess: (saved) => {
      toast({
        title: isEdit ? "Brain Person を更新しました" : "Brain Person を登録しました",
        description: isEdit
          ? "変更を保存しました。"
          : "次は本人動画・音声・同意書のアップロードに進みましょう。",
      });
      queryClient.invalidateQueries({ queryKey: ["brain-persons"] });
      const newId = saved?.id || personId;
      if (newId && !isEdit) {
        navigate(`/brain-builder/persons/${newId}/consent`);
      } else {
        navigate("/brain-builder");
      }
    },
    onError: (err) => {
      toast({
        title: "保存に失敗しました",
        description: err?.message || "詳細はコンソールを確認してください。",
        variant: "destructive",
      });
    },
  });

  const toggleStrength = (s) => {
    setForm((f) => ({
      ...f,
      strengthFields: f.strengthFields.includes(s)
        ? f.strengthFields.filter((x) => x !== s)
        : [...f.strengthFields, s],
    }));
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/brain-builder")}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Brain Builder へ戻る
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-cyan-600 uppercase tracking-wider">
          <Brain className="w-4 h-4" />
          Step 1 / 5 — Brain Person 登録
        </div>
        <h1 className="text-3xl font-bold text-slate-900">
          {isEdit ? "Brain Person を編集" : "会社の脳みそとなる人物を登録"}
        </h1>
        <p className="text-slate-600">
          代表者・部門長・熟練社員など、会社の判断基準・教育方針・対応方針を持つ人物の情報を登録します。
        </p>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">氏名 <span className="text-red-500">*</span></Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                placeholder="山田 太郎"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="department">所属部門</Label>
              <Input
                id="department"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                placeholder="営業本部 / 製造部 など"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>役職プリセット</Label>
              <Select value={rolePreset} onValueChange={(v) => {
                setRolePreset(v);
                if (v !== "custom") {
                  const opt = ROLE_OPTIONS.find((o) => o.value === v);
                  if (opt) setForm((f) => ({ ...f, roleTitle: opt.label }));
                }
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roleTitle">役職（自由記述）</Label>
              <Input
                id="roleTitle"
                value={form.roleTitle}
                onChange={(e) => setForm((f) => ({ ...f, roleTitle: e.target.value }))}
                placeholder="代表取締役 / 営業部長 など"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expertiseDomain">担当領域・専門分野</Label>
            <Input
              id="expertiseDomain"
              value={form.expertiseDomain}
              onChange={(e) => setForm((f) => ({ ...f, expertiseDomain: e.target.value }))}
              placeholder="法人営業 / 顧客対応 / 新人教育 など"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Brain としての特徴</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>判断が得意な分野（複数選択可）</Label>
            <div className="flex flex-wrap gap-2">
              {STRENGTH_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStrength(s)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    form.strengthFields.includes(s)
                      ? "bg-cyan-500 text-white border-cyan-500"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="speakingStyle">話し方の特徴</Label>
            <Textarea
              id="speakingStyle"
              value={form.speakingStyle}
              onChange={(e) => setForm((f) => ({ ...f, speakingStyle: e.target.value }))}
              placeholder="例：簡潔で論理的。結論から伝える。専門用語は使わず、相手に合わせて言い換える。"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="valuesNote">価値観・大切にしていること</Label>
            <Textarea
              id="valuesNote"
              value={form.valuesNote}
              onChange={(e) => setForm((f) => ({ ...f, valuesNote: e.target.value }))}
              placeholder="例：お客様の利益を最優先する。誠実さ。長期的な信頼関係。"
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-600" />
            利用範囲（同意とは別の事前ポリシー）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-slate-200">
            <div>
              <Label htmlFor="internalUseAllowed" className="font-medium">社内利用を許可</Label>
              <p className="text-xs text-slate-500 mt-1">
                社員向けの新人研修・仕事相談・社内 AI チャットで利用可能にします。
              </p>
            </div>
            <Switch
              id="internalUseAllowed"
              checked={form.internalUseAllowed}
              onCheckedChange={(v) => setForm((f) => ({ ...f, internalUseAllowed: v }))}
            />
          </div>
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-slate-200">
            <div>
              <Label htmlFor="externalUseAllowed" className="font-medium">社外利用を許可</Label>
              <p className="text-xs text-slate-500 mt-1">
                顧客向け説明・採用説明・パブリックなプレビューで利用可能にします（要慎重判断）。
              </p>
            </div>
            <Switch
              id="externalUseAllowed"
              checked={form.externalUseAllowed}
              onCheckedChange={(v) => setForm((f) => ({ ...f, externalUseAllowed: v }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="運用上のメモや注意事項を記載"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => navigate("/brain-builder")}>キャンセル</Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="w-4 h-4 mr-1" />
          {saveMutation.isPending ? "保存中..." : isEdit ? "保存" : "次へ：同意・素材アップロード"}
        </Button>
      </div>
    </div>
  );
}
