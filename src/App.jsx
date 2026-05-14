import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { useClientCompanyId } from '@/lib/useClientCompanyId';
import { api } from '@/lib/api';
// Pages
import Login from '@/pages/Login';
import BrainEntryUpload from '@/pages/BrainEntryUpload';
import BrainAvatarStudio from '@/pages/BrainAvatarStudio';

function FullScreenLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  );
}

function UserNotRegistered() {
  const { user, logout } = useAuth();
  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-bold text-slate-900">アカウントの初期設定が完了していません</h1>
        <p className="text-sm text-slate-600">
          メールアドレス <strong>{user?.email}</strong> の user_profile が見つかりません。
          管理者に <code>user_profiles</code> テーブルへの登録（business_role / client_company_id 設定）を依頼してください。
        </p>
        <button onClick={logout} className="text-sm text-cyan-600 underline">別アカウントでログインし直す</button>
      </div>
    </div>
  );
}

function RootEntry() {
  const clientCompanyId = useClientCompanyId();
  const { data: persons, isLoading } = useQuery({
    queryKey: ['brain-persons-check', clientCompanyId],
    queryFn: () => api.listBrainPersons(),
    enabled: !!clientCompanyId,
  });
  if (!clientCompanyId || isLoading) return <FullScreenLoading />;
  const hasBrain = Array.isArray(persons) && persons.length > 0;
  return hasBrain ? <BrainAvatarStudio /> : <BrainEntryUpload />;
}

const AuthenticatedApp = () => {
  const { session, isLoadingAuth, authError, user } = useAuth();

  if (isLoadingAuth) return <FullScreenLoading />;
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  if (authError?.type === 'user_not_registered' || (session && !user)) {
    return <UserNotRegistered />;
  }
  return (
    <Routes>
      <Route path="/" element={<RootEntry />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
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
  );
}

export default App;
