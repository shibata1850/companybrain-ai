import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  TrendingUp, Users, AlertCircle, Target, DollarSign, Zap,
  Edit3, Save, X, CheckCircle2, Clock, BarChart3, MessageSquare
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

function KPICard({ label, value, unit = "", icon: IconComponent }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {IconComponent && <IconComponent className="w-4 h-4 text-cyan-500" />}
      </div>
      <p className="text-3xl font-bold text-slate-900">{value.toLocaleString()}{unit}</p>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const { data: metric } = useQuery({
    queryKey: ["executiveMetric", CLIENT_ID, currentMonth],
    queryFn: () =>
      base44.entities.ExecutiveMetric.filter({ clientCompanyId: CLIENT_ID, month: currentMonth })
        .then(m => m[0] || { clientCompanyId: CLIENT_ID, month: currentMonth }),
  });

  const { data: okr } = useQuery({
    queryKey: ["okr", CLIENT_ID],
    queryFn: () =>
      base44.entities.OKREntry.filter({ clientCompanyId: CLIENT_ID })
        .then(o => o[0] || {}),
  });

  const { data: cpaAnalysis } = useQuery({
    queryKey: ["cpaAnalysis", CLIENT_ID, currentMonth],
    queryFn: () =>
      base44.entities.CPAAnalysis.filter({ clientCompanyId: CLIENT_ID, month: currentMonth })
        .then(c => c[0] || { clientCompanyId: CLIENT_ID, month: currentMonth }),
  });

  const { data: ltv } = useQuery({
    queryKey: ["ltv", CLIENT_ID],
    queryFn: () =>
      base44.entities.LTVAnalysis.filter({ clientCompanyId: CLIENT_ID })
        .then(l => l[0] || { clientCompanyId: CLIENT_ID }),
  });

  const { data: pdca } = useQuery({
    queryKey: ["pdca", CLIENT_ID, currentMonth],
    queryFn: () =>
      base44.entities.PDCALog.filter({ clientCompanyId: CLIENT_ID, month: currentMonth })
        .then(p => p[0] || { clientCompanyId: CLIENT_ID, month: currentMonth }),
  });

  const [editingSection, setEditingSection] = useState(null);
  const [editForm, setEditForm] = useState({});

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (data.id) {
        return await base44.entities[editingSection].update(data.id, data);
      } else {
        return await base44.entities[editingSection].create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      setEditingSection(null);
      toast({ title: "保存完了", description: "データが更新されました。" });
    },
    onError: (err) => {
      toast({ title: "エラー", description: err.message, variant: "destructive" });
    },
  });

  const handleEdit = (section, data) => {
    setEditingSection(section);
    setEditForm(data || {});
  };

  const handleSave = () => {
    saveMutation.mutate(editForm);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-7xl mx-auto space-y-10">
        <PageHeader
          title="経営指標ダッシュボード"
          description="CompanyBrain AI 導入効果の可視化"
        />

        {/* KPI セクション */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">KPI</h2>
            <Button
              size="sm" variant="outline"
              onClick={() => handleEdit("ExecutiveMetric", metric)}
            >
              <Edit3 className="w-3.5 h-3.5 mr-1" /> 編集
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KPICard label="月間AI回答数" value={metric?.monthlyAnswers || 0} icon={MessageSquare} />
            <KPICard label="有人対応削減件数" value={metric?.reducedHumanReview || 0} icon={Users} />
            <KPICard label="未回答率" value={(metric?.unansweredRate || 0) * 100} unit="%" icon={AlertCircle} />
            <KPICard label="回答改善率" value={(metric?.improvementRate || 0) * 100} unit="%" icon={TrendingUp} />
            <KPICard label="新入社員利用数" value={metric?.newEmployeeUsers || 0} icon={Users} />
            <KPICard label="動画生成数" value={metric?.videoGenerated || 0} icon={BarChart3} />
          </div>
        </div>

        {/* ROI セクション */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">ROI分析</h2>
            <Button
              size="sm" variant="outline"
              onClick={() => handleEdit("ExecutiveMetric", metric)}
            >
              <Edit3 className="w-3.5 h-3.5 mr-1" /> 編集
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-3">
              <p className="text-sm font-medium text-slate-600">削減時間</p>
              <p className="text-4xl font-bold text-cyan-500">{metric?.reducedHours || 0}h</p>
              <p className="text-xs text-slate-500">月間削減時間</p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-3">
              <p className="text-sm font-medium text-slate-600">人件費換算削減額</p>
              <p className="text-4xl font-bold text-cyan-500">¥{(metric?.reducedLaborCost || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-500">時給：¥{(metric?.hourlyRate || 3000).toLocaleString()}/h</p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-3">
              <p className="text-sm font-medium text-slate-600">月額費用</p>
              <p className="text-4xl font-bold text-slate-900">¥{(metric?.monthlyCost || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-500">サービス利用料</p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-3">
              <p className="text-sm font-medium text-slate-600">推定ROI</p>
              <p className="text-4xl font-bold text-emerald-600">{(metric?.estimatedRoi || 0).toFixed(1)}%</p>
              <p className="text-xs text-slate-500">投資効率</p>
            </div>
          </div>
        </div>

        {/* OKR セクション */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">OKR（四半期目標）</h2>
            <Button
              size="sm" variant="outline"
              onClick={() => handleEdit("OKREntry", okr)}
            >
              <Edit3 className="w-3.5 h-3.5 mr-1" /> 編集
            </Button>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4">
            {editingSection === "OKREntry" ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Objective（目標）"
                  value={editForm.objective || ""}
                  onChange={(e) => setEditForm({ ...editForm, objective: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                    <Save className="w-3.5 h-3.5 mr-1" /> 保存
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingSection(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-1">Objective</p>
                  <p className="text-slate-600">{okr?.objective || "未設定"}</p>
                </div>
                {okr?.progressRate && (
                  <div>
                    <p className="text-sm font-semibold text-slate-900 mb-2">進捗率</p>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-cyan-500 h-2 rounded-full transition-all"
                        style={{ width: `${(okr.progressRate * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{(okr.progressRate * 100).toFixed(1)}%</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* CPA 分析 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">CPA分析（顧客獲得単価）</h2>
            <Button
              size="sm" variant="outline"
              onClick={() => handleEdit("CPAAnalysis", cpaAnalysis)}
            >
              <Edit3 className="w-3.5 h-3.5 mr-1" /> 編集
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["recruitment", "inquiry", "lead"].map((type) => {
              const labels = {
                recruitment: "採用CPA",
                inquiry: "問い合わせCPA",
                lead: "営業リードCPA",
              };
              const before = cpaAnalysis?.[`${type}CpaBefore`] || 0;
              const after = cpaAnalysis?.[`${type}CpaAfter`] || 0;
              const savings = before - after;
              const savingsRate = before > 0 ? (savings / before) * 100 : 0;

              return (
                <div key={type} className="bg-white rounded-2xl p-6 border border-slate-100 space-y-3">
                  <p className="text-sm font-medium text-slate-600">{labels[type]}</p>
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-bold text-slate-900">¥{after.toLocaleString()}</p>
                      <p className="text-xs text-slate-500 line-through">¥{before.toLocaleString()}</p>
                    </div>
                    {savings > 0 && (
                      <p className="text-xs font-medium text-emerald-600">
                        ↓ ¥{savings.toLocaleString()} ({savingsRate.toFixed(1)}%削減)
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* LTV分析 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">LTV分析（顧客生涯価値）</h2>
            <Button
              size="sm" variant="outline"
              onClick={() => handleEdit("LTVAnalysis", ltv)}
            >
              <Edit3 className="w-3.5 h-3.5 mr-1" /> 編集
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">顧客継続率</p>
                <p className="text-3xl font-bold text-cyan-500">{((ltv?.retentionRate || 0) * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">平均契約月数</p>
                <p className="text-3xl font-bold text-cyan-500">{ltv?.averageContractMonths || 0}ヶ月</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">顧客単価</p>
                <p className="text-3xl font-bold text-cyan-500">¥{(ltv?.customerUnitPrice || 0).toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">LTV（顧客生涯価値）</p>
                <p className="text-4xl font-bold text-emerald-600">¥{(ltv?.ltv || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">CAC（顧客獲得コスト）</p>
                <p className="text-2xl font-bold text-slate-900">¥{(ltv?.cac || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600 mb-2">LTV/CAC比率</p>
                <p className={`text-3xl font-bold ${(ltv?.lacRatio || 0) >= 3 ? "text-emerald-600" : "text-amber-600"}`}>
                  {((ltv?.lacRatio || 0)).toFixed(2)}
                </p>
                <p className="text-xs text-slate-500 mt-1">理想値：3.0以上</p>
              </div>
            </div>
          </div>
        </div>

        {/* PDCA サイクル */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">PDCAサイクル（改善ログ）</h2>
            <Button
              size="sm" variant="outline"
              onClick={() => handleEdit("PDCALog", pdca)}
            >
              <Edit3 className="w-3.5 h-3.5 mr-1" /> 編集
            </Button>
          </div>
          {editingSection === "PDCALog" ? (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-900 block mb-1">Plan（計画）</label>
                <Textarea
                  value={editForm.plan || ""}
                  onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                  className="text-sm"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-900 block mb-1">Do（実行）</label>
                <Textarea
                  value={editForm.do || ""}
                  onChange={(e) => setEditForm({ ...editForm, do: e.target.value })}
                  className="text-sm"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-900 block mb-1">Check（検証）</label>
                <Textarea
                  value={editForm.check || ""}
                  onChange={(e) => setEditForm({ ...editForm, check: e.target.value })}
                  className="text-sm"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-900 block mb-1">Action（改善）</label>
                <Textarea
                  value={editForm.action || ""}
                  onChange={(e) => setEditForm({ ...editForm, action: e.target.value })}
                  className="text-sm"
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                  <Save className="w-3.5 h-3.5 mr-1" /> 保存
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingSection(null)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {["plan", "do", "check", "action"].map((key) => (
                <div key={key} className="bg-white rounded-2xl p-6 border border-slate-100">
                  <p className="text-sm font-semibold text-slate-900 mb-2 capitalize">
                    {key === "plan" ? "Plan（計画）" : key === "do" ? "Do（実行）" : key === "check" ? "Check（検証）" : "Action（改善）"}
                  </p>
                  <p className="text-sm text-slate-600">{pdca?.[key] || "未入力"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}