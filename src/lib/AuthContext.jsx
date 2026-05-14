import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);          // 拡張ユーザー (api.me() の結果)
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false); // 互換性のため残置
  const [authError, setAuthError] = useState(null);

  const refreshUserProfile = async () => {
    try {
      const me = await api.me();
      setUser(me);
      setAuthError(null);
    } catch (err) {
      console.warn('[auth] me() failed:', err);
      // user_profile が無いケース → エラーではなく未登録扱い
      if (err?.status === 401) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      } else {
        setUser(null);
        setAuthError({ type: 'user_not_registered', message: err?.message || 'User profile not found' });
      }
    }
  };

  useEffect(() => {
    // 初回ロード: 現在のセッションを取得
    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session || null);
      if (data?.session) {
        refreshUserProfile().finally(() => setIsLoadingAuth(false));
      } else {
        setIsLoadingAuth(false);
      }
    });
    // セッション変化を監視
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        refreshUserProfile();
      } else {
        setUser(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loginWithEmail = async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signupWithEmail = async ({ email, password }) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const navigateToLogin = () => {
    // 現実装ではログイン画面に強制遷移
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{
      session,
      user,
      isAuthenticated: !!session,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      loginWithEmail,
      signupWithEmail,
      logout,
      navigateToLogin,
      refreshUserProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
