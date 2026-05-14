import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft, ArrowRight, Sparkles, Check,
  GraduationCap, Briefcase, Users, Crown, Repeat, HardHat,
  ScrollText, FileSearch, UserPlus, Compass, AlertCircle
} from "lucide-react";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const USE_CASE_DEFS = [
  { type: "new_employee_training", label: "新人研修", icon: GraduationCap, color: "from-cyan-500 to-blue-600", description: "新人がアバターに「どう判断する？」を聞ける研修体験を作ります。" },
  { type: "sales_education", label: "営業教育", icon: Briefcase, color: "from-emerald-500 to-teal-600", description: "営業ロープレ、商談判断、価格交渉、提案レビュー基準を抽出します。" },
  { type: "customer_support", label: "顧客対応", icon: Users, color: "from-orange-500 to-red-500", description: "顧客対応の品質統一・クレーム対応の判断基準を整理します。" },
  { type: "founder_judgment", label: "社長の判断基準継承", icon: Crown, color: "from-amber-500 to-yellow-500", description: "代表者・創業者の判断スタイルと哲学を会社の脳みそに残します。" },
  { type: "succession", label: "事業承継", icon: Repeat, color: "from-purple-500 to-pink-600", description: "次世代への引き継ぎ準備として、判断・関係・経緯を結晶化します。" },
  { type: "field_education", label: "現場教育", icon: HardHat, color: "from-slate-500 to-slate-700", description: "工場・店舗・現場の暗黙知をアバター対話で形式知化します。" },
  { type: "internal_rule", label: "社内ルール確認", icon: ScrollText, color: "from-indigo-500 to-blue-700", description: "社内規定・運用ルール・例外判断の基準を整理します。" },
  { type: "work_review", label: "仕事レビュー", icon: FileSearch, color: "from-rose-500 to-pink-600", description: "メール・提案書・報告書のレビュー基準を抽出し、後続のレビュー機能に活用します。" },
  { type: "hiring_explanation", label: "採用説明", icon: UserPlus, color: "from-lime-500 to-green-600", description: "採用候補者への会社説明・カルチャー説明の基準を作ります。" },
  { type: "management_decision", label: "経営判断支援", icon: Compass, color: "from-blue-700 to-cyan-600", description: "経営判断のフレーム・優先順位の付け方・リスク評価を結晶化します。" },
];

export default function BrainUseCaseWizard() {
  const { personId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [me, setMe] = useState(null);
  const [selected, setSelected] = useState(new Set());

  useEffect(() => { base44.auth.me().then(setMe).catch(() => {}); }, []);

  const { data: person } = useQuery({
    queryKey: ["brain-person", personId],
    queryFn: () => base44.entities.BrainPerson.get(personId),
    enabled: !!personId,
  });

  const { data: existing = [], refetch } = useQuery({
    queryKey: ["brain-usecases", personId],
    queryFn: () => base44.entities.BrainUseCase.filter({ brainPersonId: personId }),
    enabled: !!personId,
  });

  const { data: consents = [] } = useQuery({
    queryKey: ["brain-consents", personId],
    queryFn: () => base44.entities.BrainConsentRecord.filter({ brainPersonId: personId }),
    enabled: !!personId,
  });

  const consentApproved = useMemo(() => {
    const latest = (consents || [])
      .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];
    return latest?.consentStatus === "approved";
  }, [consents]);

  useEffect(() => {
    if (existing && existing.length > 0) {
      setSelected(new Set(existing.map((u) => u.useCaseType)));
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const existingTypes = new Set((existing || []).map((u) => u.useCaseType));
      const desired = selected;

      const toCreate = [...desired].filter((t) => !existingTypes.has(t));
      const toDelete = (existing || []).filter((u) => !desired.has(u.useCaseType));

      for (const u of toDelete) {
        await base44.entities.BrainUseCase.delete(u.id);
      }
      for (const t of toCreate) {
        await base44.entities.BrainUseCase.create({
          clientCompanyId: CLIENT_ID,
          brainPersonId: personId,
          useCaseType: t,
          priority: 0,
          selectedAt: new Date().toISOString(),
          selectedBy: me?.id || "",
        });
      }
    },
    onSuccess: () => {
      toast({
        title: "活用方法を保存しました",
        description: "次は Brain Interview に進みましょう。",
      });
      queryClient.invalidateQueries({ queryKey: ["brain-usecases"] });
      refetch();
      navigate(`/brain-builder/persons/${personId}/interview`);
    },
    onError: (err) => {
      toast({ title: "保存に失敗しました", description: err?.message, variant: "destructive" });
    },
  });

  const toggle = (t) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  };

  if (!person) return <div className="p-8 text-sm text-slate-500">読み込み中...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/brain-builder")}>
        <ArrowLeft className="w-4 h-4 mr-1" />
        Brain Builder へ戻る
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-cyan-600 uppercase tracking-wider">
          <Sparkles className="w-4 h-4" />
          Step 3 / 5 — 活用方法ウィザード
        </div>
        <h1 className="text-3xl font-bold text-slate-900">{person.fullName} の Brain を、何に活用しますか？</h1>
        <p className="text-slate-600">
          選んだ活用方法に応じて、Brain Interview の質問テンプレートと方針抽出のカテゴリが調整されます（複数選択可）。
        </p>
      </div>

      {!consentApproved && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-900">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold mb-0.5">同意がまだ承認されていません</p>
            <p className="text-xs">活用方法は選択できますが、Brain Interview を開始するには
              <Link to={`/brain-builder/persons/${personId}/consent`} className="underline mx-1">同意承認</Link>
              が必要です。
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {USE_CASE_DEFS.map((u) => {
          const isSelected = selected.has(u.type);
          const Icon = u.icon;
          return (
            <button
              key={u.type}
              type="button"
              onClick={() => toggle(u.type)}
              className={`text-left rounded-2xl border-2 p-4 transition-all ${
                isSelected
                  ? "border-cyan-500 bg-cyan-50/40 shadow-sm"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${u.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-cyan-500 text-white flex items-center justify-center">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
              <p className="font-semibold text-sm text-slate-900 mb-1.5">{u.label}</p>
              <p className="text-[11px] leading-relaxed text-slate-600">{u.description}</p>
            </button>
          );
        })}
      </div>

      <Card className="border-slate-200">
        <CardContent className="pt-5 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            選択中: <span className="font-bold text-slate-900">{selected.size}</span> 件
            {selected.size > 0 && (
              <span className="ml-3 text-xs text-slate-500">
                {[...selected].map((t) => USE_CASE_DEFS.find((d) => d.type === t)?.label).join("、")}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to={`/brain-builder/persons/${personId}/consent`}>← 同意管理へ戻る</Link>
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={selected.size === 0 || saveMutation.isPending}>
              {saveMutation.isPending ? "保存中..." : "次へ：Brain Interview"}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
