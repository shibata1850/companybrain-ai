import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';
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
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
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