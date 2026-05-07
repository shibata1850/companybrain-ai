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
import ChatExternal from '@/pages/ChatExternal';
import ChatInternal from '@/pages/ChatInternal';
import ChatExecutive from '@/pages/ChatExecutive';
import AIChat from '@/pages/AIChat';

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
        <Route path="/chat-external" element={<ChatExternal />} />
        <Route path="/chat-internal" element={<ChatInternal />} />
        <Route path="/chat-executive" element={<ChatExecutive />} />
        <Route path="/ai-chat" element={<AIChat />} />
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