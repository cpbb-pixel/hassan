import React, { useState } from 'react';
import { Lock, User as UserIcon, ArrowLeft } from 'lucide-react';
import { apiRequest, setStoredToken } from '../lib/api.ts';
import type { User } from '../shared/types.ts';

interface LoginViewProps {
  onSuccess: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setStoredToken(res.token);
      onSuccess(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F7FA] px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_40px_-12px_rgba(11,29,54,0.16)]">
        {/* Royal Navy Architectural Header */}
        <div className="bg-gradient-to-l from-[#071324] via-[#0B1D36] to-[#132A4A] px-8 py-7 text-white">
          <div className="inline-flex items-center gap-2 border-b border-teal-400/35 pb-2">
            <span className="h-2.5 w-2.5 rounded-xs bg-orange-500" />
            <span className="text-2xl font-extrabold tracking-tight text-white">سُفرة ERP</span>
          </div>
          <p className="mt-2.5 text-xs text-teal-200/90">نظام إدارة المطاعم ونقاط البيع والمحاسبة</p>
        </div>

        {/* Clean Login Form Only */}
        <div className="p-8">
          <div className="mb-6">
            <h1 className="text-xl font-extrabold text-[#0B1D36]">تسجيل الدخول</h1>
            <p className="mt-1 text-xs text-slate-500">أدخل اسم المستخدم وكلمة المرور للمتابعة</p>
          </div>

          {error && (
            <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#0B1D36]">اسم المستخدم</label>
              <div className="relative">
                <UserIcon className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-10 pl-4 text-sm text-[#0B1D36] outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  placeholder="أدخل اسم المستخدم"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#0B1D36]">كلمة المرور</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-10 pl-4 text-sm text-[#0B1D36] outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-l from-orange-600 to-orange-500 px-5 py-3 text-sm font-bold text-white shadow-sm shadow-orange-600/20 transition-all hover:from-orange-700 hover:to-orange-600 disabled:opacity-60"
            >
              <span>{loading ? 'جاري التحقق...' : 'تسجيل الدخول'}</span>
              <ArrowLeft className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
