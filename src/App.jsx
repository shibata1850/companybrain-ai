import React from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';
import { base44 } from '@/api/base44Client';
import { useClientCompanyId } from '@/lib/useClientCompanyId';
// Add page imports here
import Dashboard from '@/pages/Dashboard';
import CompanyProfile from '@/pages/CompanyProfile';
import Philosophy from '@/pages/Philosophy';
import KnowledgeUpload from '@/pages/KnowledgeUpload';
import KnowledgeList from '@/pages/KnowledgeList';
import AIChat from '@/pages/AIChat';
import AdminUserSettings from '@/pages/AdminUserSettings';
import PublicAIPreview from '@/pages/PublicAIPreview';
import InternalAIChat from '@/pages/InternalAIChat';
import ExecutiveAIChat from '@/pages/ExecutiveAIChat';
import ScriptGenerator from '@/pages/ScriptGenerator';
import ExecutiveDashboard from '@/pages/ExecutiveDashboard';
import UsageAndBilling from '@/pages/UsageAndBilling';
import AnswerLogs from '@/pages/AnswerLogs';
import ExecutiveAvatarManagement from '@/pages/ExecutiveAvatarManagement';
import AvatarConsentRegistration from '@/pages/AvatarConsentRegistration';
import AvatarCreationSetup from '@/pages/AvatarCreationSetup';
import AvatarConsultationRoom from '@/pages/AvatarConsultationRoom';
import NewEmployeeTraining from '@/pages/NewEmployeeTraining';
import WorkReviewPage from '@/pages/WorkReviewPage';
import AvatarContextSync from '@/pages/AvatarContextSync';
import SessionLogs from '@/pages/SessionLogs';
import AvatarUsageStats from '@/pages/AvatarUsageStats';
import ExecutiveBrainDemo from '@/pages/ExecutiveBrainDemo';
import ExecutiveBrainPreLaunchTest from '@/pages/ExecutiveBrainPreLaunchTest';
import ExecutiveBrainDiagnostics from '@/pages/ExecutiveBrainDiagnostics';
import PricingPlans from '@/pages/PricingPlans';
// Brain Builder (Phase 1)
import BrainBuilderHome from '@/pages/BrainBuilderHome';
import BrainPersonRegistration from '@/pages/BrainPersonRegistration';
import BrainSourceConsentUpload from '@/pages/BrainSourceConsentUpload';
import BrainUseCaseWizard from '@/pages/BrainUseCaseWizard';
import BrainInterview from '@/pages/BrainInterview';
import BrainPolicyReview from '@/pages/BrainPolicyReview';
// Brain Avatar Studio (Phase 1.5 — cinematic entry)
import BrainEntryUpload from '@/pages/BrainEntryUpload';
import BrainAvatarStudio from '@/pages/BrainAvatarStudio';

/**
 * RootEntry — `/` ルートのエントリポイント。
 * Brain Person が登録されていなければ真っ白な動画アップロード画面、
 * 登録済みなら Avatar Studio を表示する。
 */
function RootEntry() {
  const clientCompanyId = useClientCompanyId();
  const { data: persons, isLoading } = useQuery({
    queryKey: ['brain-persons-check', clientCompanyId],
    queryFn: () => base44.entities.BrainPerson.filter({ clientCompanyId }),
    enabled: !!clientCompanyId,
  });

  if (!clientCompanyId || isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  const hasBrain = Array.isArray(persons) && persons.length > 0;

  // Brain が無ければ真っ白な画面（AppLayout 無し）
  if (!hasBrain) {
    return <BrainEntryUpload />;
  }

  // Brain がある場合は AppLayout 経由で Studio を表示
  return (
    <AppLayout>
      <BrainAvatarStudio />
    </AppLayout>
  );
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      {/* / は Brain 存在チェックして真っ白画面 or Studio に分岐 (Layout も内部で出し分け) */}
      <Route path="/" element={<RootEntry />} />
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/company-profile" element={<CompanyProfile />} />
        <Route path="/philosophy" element={<Philosophy />} />
        <Route path="/knowledge-upload" element={<KnowledgeUpload />} />
        <Route path="/knowledge-list" element={<KnowledgeList />} />
        <Route path="/ai-chat" element={<AIChat />} />
        <Route path="/admin-user-settings" element={<AdminUserSettings />} />
        <Route path="/public-ai-preview" element={<PublicAIPreview />} />
        <Route path="/internal-ai-chat" element={<InternalAIChat />} />
        <Route path="/executive-ai-chat" element={<ExecutiveAIChat />} />
        <Route path="/scripts" element={<ScriptGenerator />} />
        <Route path="/executive-dashboard" element={<ExecutiveDashboard />} />
        <Route path="/usage-and-billing" element={<UsageAndBilling />} />
        <Route path="/answer-logs" element={<AnswerLogs />} />
        <Route path="/avatar-management" element={<ExecutiveAvatarManagement />} />
        <Route path="/avatar-consent/:avatarId" element={<AvatarConsentRegistration />} />
        <Route path="/avatar-creation/:avatarId" element={<AvatarCreationSetup />} />
        <Route path="/avatar-consultation" element={<AvatarConsultationRoom />} />
        <Route path="/avatar-training" element={<NewEmployeeTraining />} />
        <Route path="/work-review" element={<WorkReviewPage />} />
        <Route path="/avatar-context/:avatarId" element={<AvatarContextSync />} />
        <Route path="/session-logs" element={<SessionLogs />} />
        <Route path="/avatar-usage" element={<AvatarUsageStats />} />
        <Route path="/executive-brain-demo" element={<ExecutiveBrainDemo />} />
        <Route path="/executive-brain-pre-launch-test" element={<ExecutiveBrainPreLaunchTest />} />
        <Route path="/executive-brain-diagnostics" element={<ExecutiveBrainDiagnostics />} />
        <Route path="/pricing-plans" element={<PricingPlans />} />
        {/* Brain Builder (Phase 1) */}
        <Route path="/brain-builder" element={<BrainBuilderHome />} />
        <Route path="/brain-builder/persons/new" element={<BrainPersonRegistration />} />
        <Route path="/brain-builder/persons/:personId/edit" element={<BrainPersonRegistration />} />
        <Route path="/brain-builder/persons/:personId/consent" element={<BrainSourceConsentUpload />} />
        <Route path="/brain-builder/persons/:personId/use-cases" element={<BrainUseCaseWizard />} />
        <Route path="/brain-builder/persons/:personId/interview" element={<BrainInterview />} />
        <Route path="/brain-builder/persons/:personId/interview/:sessionId" element={<BrainInterview />} />
        <Route path="/brain-builder/persons/:personId/policies" element={<BrainPolicyReview />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App