import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Plus, UserCircle2, ShieldCheck, Sparkles,
  MessageCircle, ClipboardCheck, ArrowRight, AlertCircle
} from "lucide-react";

const CLIENT_ID = "69fc3d9af68187d823c1a41b";

const STEPS = [
  { key: "person", label: "人物登録", icon: UserCircle2 },
  { key: "consent", label: "動画・音声・同意", icon: ShieldCheck },
  { key: "useCase", label: "活用方法選択", icon: Sparkles },
  { key: "interview", label: "Brain Interview", icon: MessageCircle },
  { key: "review", label: "方針レビュー", icon: ClipboardCheck },
];

function calculateBrainProgress(person, latestConsent, useCases, sessions, candidates) {
  let score = 0;
  const status = {};
  if (person) { score += 20; status.person = "done"; } else { status.person = "todo"; }
  if (latestConsent?.consentStatus === "approved") { score += 20; status.consent = "done"; }
  else if (latestConsent) { status.consent = "in_progress"; } else { status.consent = "todo"; }
  if ((useCases || []).length > 0) { score += 15; status.useCase = "done"; } else { status.useCase = "todo"; }
  const completedSessions = (sessions || []).filter((s) => s.status === "completed").length;
  if (completedSessions > 0) {
    score += Math.min(20, completedSessions * 7);
    status.interview = "done";
  } else if ((sessions || []).length > 0) {
    status.interview = "in_progress";
  } else {
    status.interview = "todo";
  }
  const approvedCount = (candidates || []).filter((c) => c.status === "approved").length;
  if (approvedCount > 0) {
    score += Math.min(25, approvedCount * 5);
    status.review = "done";
  } else if ((candidates || []).length > 0) {
    status.review = "in_progress";
  } else {
    status.review = "todo";
  }
  return { score: Math.min(100, score), status, approvedCount, completedSessions };
}

function StepBadge({ status }) {
  if (status === "done") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">完了</Badge>;
  if (status === "in_progress") return <Badge className="bg-amber-100 text-amber-700 border-amber-200">進行中</Badge>;
  return <Badge variant="outline" className="text-slate-500">未着手</Badge>;
}

function PersonCard({ person, allConsents, allUseCases, allSessions, allCandidates }) {
  const personConsents = (allConsents || []).filter((c) => c.brainPersonId === person.id);
  const latestConsent = personConsents
    .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];
  const useCases = (allUseCases || []).filter((u) => u.brainPersonId === person.id);
  const sessions = (allSessions || []).filter((s) => s.brainPersonId === person.id);
  const candidates = (allCandidates || []).filter((c) => c.brainPersonId === person.id);

  const { score, status, approvedCount, completedSessions } = calculateBrainProgress(
    person, latestConsent, useCases, sessions, candidates
  );

  const consentApproved = latestConsent?.consentStatus === "approved";
  const nextHref = !consentApproved
    ? `/brain-builder/persons/${person.id}/consent`
    : useCases.length === 0
    ? `/brain-builder/persons/${person.id}/use-cases`
    : `/brain-builder/persons/${person.id}/interview`;

  return (
    <Card className="border-slate-200 hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg truncate">{person.fullName}</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {person.roleTitle || "役職未設定"}{person.department ? ` ・ ${person.department}` : ""}
              </p>
            </div>
          </div>
          <Badge variant={person.status === "active" ? "default" : "outline"} className="shrink-0">
            {person.status === "active" ? "Active" : person.status === "archived" ? "Archived" : "Draft"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-slate-600">Brain 完成度</p>
            <p className="text-xs font-bold text-slate-900">{score}%</p>
          </div>
          <Progress value={score} className="h-2" />
        </div>

        <div className="space-y-1.5">
          {STEPS.map((step) => (
            <div key={step.key} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <step.icon className="w-3.5 h-3.5" />
                <span>{step.label}</span>
              </div>
              <StepBadge status={status[step.key]} />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
          <span>承認済み方針 <strong className="text-slate-900">{approvedCount}</strong></span>
          <span>完了 Interview <strong className="text-slate-900">{completedSessions}</strong></span>
        </div>

        <div className="flex gap-2">
          <Button asChild size="sm" className="flex-1">
            <Link to={nextHref}>
              次のステップへ <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/brain-builder/persons/${person.id}/edit`}>編集</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BrainBuilderHome() {
  const { data: persons = [], isLoading } = useQuery({
    queryKey: ["brain-persons", CLIENT_ID],
    queryFn: () => base44.entities.BrainPerson.filter({ clientCompanyId: CLIENT_ID }),
  });

  const { data: allConsents = [] } = useQuery({
    queryKey: ["brain-consents", CLIENT_ID],
    queryFn: () => base44.entities.BrainConsentRecord.filter({ clientCompanyId: CLIENT_ID }),
  });

  const { data: allUseCases = [] } = useQuery({
    queryKey: ["brain-usecases", CLIENT_ID],
    queryFn: () => base44.entities.BrainUseCase.filter({ clientCompanyId: CLIENT_ID }),
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["brain-sessions", CLIENT_ID],
    queryFn: () => base44.entities.BrainInterviewSession.filter({ clientCompanyId: CLIENT_ID }),
  });

  const { data: allCandidates = [] } = useQuery({
    queryKey: ["brain-candidates", CLIENT_ID],
    queryFn: () => base44.entities.BrainPolicyCandidate.filter({ clientCompanyId: CLIENT_ID }),
  });

  const totalApproved = allCandidates.filter((c) => c.status === "approved").length;
  const totalDraft = allCandidates.filter((c) => c.status === "draft").length;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-cyan-600 uppercase tracking-wider">
            <Brain className="w-4 h-4" />
            Brain Builder
          </div>
          <h1 className="text-3xl font-bold text-slate-900">会社の脳みそを、対話で育てる。</h1>
          <p className="text-slate-600 max-w-2xl">
            経営者・上司・熟練社員の動画と声をもとに AI アバターを作成し、対話を通じて会社の判断基準・教育方針・営業方針・顧客対応方針を蓄積する Brain Builder です。
          </p>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <Link to="/brain-builder/persons/new">
            <Plus className="w-4 h-4 mr-1" />
            Brain Person を登録
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">登録済み Brain Person</p>
            <p className="text-3xl font-bold text-slate-900">{persons.length}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">承認済み方針 (Knowledge化)</p>
            <p className="text-3xl font-bold text-emerald-600">{totalApproved}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">承認待ちの方針候補</p>
            <p className="text-3xl font-bold text-amber-600">{totalDraft}</p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-900">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold mb-0.5">本人同意が承認されるまで、Brain Interview / アバター利用はできません。</p>
          <p className="text-xs text-amber-800/80">
            動画・音声を扱うため、各 Brain Person ごとに同意書をアップロードし、admin が承認することで初めて Brain 育成が可能になります。
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">読み込み中...</div>
      ) : persons.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="py-16 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-100 flex items-center justify-center">
              <Brain className="w-8 h-8 text-cyan-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">最初の Brain Person を登録しましょう</p>
              <p className="text-sm text-slate-500 mt-1">
                代表者・部門長・熟練社員など、会社の判断基準を持つ人物を登録します。
              </p>
            </div>
            <Button asChild size="lg">
              <Link to="/brain-builder/persons/new">
                <Plus className="w-4 h-4 mr-1" />
                Brain Person を登録する
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {persons.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              allConsents={allConsents}
              allUseCases={allUseCases}
              allSessions={allSessions}
              allCandidates={allCandidates}
            />
          ))}
        </div>
      )}
    </div>
  );
}
