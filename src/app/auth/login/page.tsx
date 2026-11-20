'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function StaffAndAdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/staff/orders';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/staff/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setErrorMsg(result.message_ar || 'البريد الوظيفي أو كلمة المرور غير صحيحة.');
        return;
      }

      router.replace(result.redirect_to || '/staff/orders');
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر الاتصال بخدمة تسجيل الدخول.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="bh-staff-login flex min-h-screen items-center justify-center bg-[#f4f1eb] px-4 text-[#201e1a]">
      <div className="w-full max-w-md rounded-sm border border-[#ded8cd] bg-[#fbfaf7] p-8 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <img src="/brand-mark.svg" alt="شعار برجر هاوس" className="mx-auto h-16 w-16"/>
          <h1 className="text-2xl font-extrabold text-[#201e1a]">دخول الموظفين والإدارة — BURGER HOUSE</h1>
          <p className="text-xs text-[#777064]">
            مصادقة خادمية عبر Supabase Auth • يتم التحقق من الدور والفرع تلقائياً على الخادم
          </p>
        </div>

        <a href="/" className="block text-center text-xs font-bold text-[#a65e36] underline underline-offset-4">العودة إلى واجهة العميل</a>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#777064] mb-1">البريد الإلكتروني الوظيفي</label>
            <input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@burgerhouse.sa"
              className="w-full rounded-sm border border-[#d8d0c4] bg-white px-4 py-3 text-sm text-[#201e1a] focus:border-[#a65e36] focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#9E9488] mb-1">كلمة المرور</label>
            <input type="password" required dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full rounded-sm border border-[#d8d0c4] bg-white px-4 py-3 text-sm text-[#201e1a] focus:border-[#a65e36] focus:outline-none" />
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
              {errorMsg}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-[#a65e36] py-3.5 text-sm font-black text-white shadow-none disabled:opacity-50">
            {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول الآمن'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function StaffAndAdminLoginPage() {
  return (
    <Suspense fallback={<div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f4f1eb] text-[#201e1a]">جاري التحميل...</div>}>
      <StaffAndAdminLoginContent />
    </Suspense>
  );
}
