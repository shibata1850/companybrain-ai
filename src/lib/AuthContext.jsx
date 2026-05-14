import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getAccessToken, setAccessToken } from '@/lib/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false); // 互換
  const [authError, setAuthError] = useState(null);

  const refresh = async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setIsLoadingAuth(false);
      return;
    }
    try {
      const me = await api.me();
      setUser(me);
      setAuthError(null);
    } catch (err) {
      console.warn('[auth] me() failed', err);
      if (err?.status === 401) {
        setAccessToken(null);
        setUser(null);
        setAuthError({ type: 'auth_required', message: 'ログインしてください' });
      } else {
        setAuthError({ type: 'unknown', message: err?.message || 'unknown' });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const loginWithEmail = async ({ email, password }) => {
    const res = await api.login({ email, password });
    setAccessToken(res.accessToken);
    await refresh();
  };

  const signupWithEmail = async ({ email, password, displayName }) => {
    const res = await api.register({ email, password, displayName });
    setAccessToken(res.accessToken);
    await refresh();
  };

  const logout = async () => {
    setAccessToken(null);
    setUser(null);
  };

  const navigateToLogin = () => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session: user ? { access_token: getAccessToken() } : null,
      isAuthenticated: !!user,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      loginWithEmail,
      signupWithEmail,
      logout,
      navigateToLogin,
      refreshUserProfile: refresh,
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
