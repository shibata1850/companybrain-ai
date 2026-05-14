import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Brain, Loader2 } from 'lucide-react';

export default function Login() {
  const { loginWithEmail, signupWithEmail } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await loginWithEmail({ email, password });
      } else {
        await signupWithEmail({ email, password, displayName });
      }
    } catch (err) {
      setError(err?.message || '失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <div className="flex items-center gap-2 justify-center mb-6 text-slate-700">
          <Brain className="w-5 h-5" />
          <span className="font-bold tracking-tight">CompanyBrain AI</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-center">
              {mode === 'login' ? 'ログイン' : '新規登録'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <Label htmlFor="displayName">表示名</Label>
                  <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例: 山田 太郎" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">メールアドレス</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">パスワード</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === 'login' ? 'ログイン' : '登録してはじめる')}
              </Button>
              <button type="button" className="w-full text-xs text-slate-500 hover:underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
                {mode === 'login' ? '新規アカウントを作成する' : '既存のアカウントでログイン'}
              </button>
              {mode === 'signup' && (
                <p className="text-[10px] text-slate-400 text-center pt-2">
                  最初に登録したアカウントは softdoing_admin（最上位管理者）になります。
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
