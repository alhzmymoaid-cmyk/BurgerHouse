'use client';

import React, { Suspense, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
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
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        setErrorMsg('بيانات الدخول غير صحيحة أو الحساب غير مسجل.');
        setLoading(false);
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from('user_profiles')
        .select('role, is_active')
        .eq('id', data.user.id)
        .single();

      if (profErr || !profile || !profile.is_active) {
        await supabase.auth.signOut();
        setErrorMsg('هذا الحساب غير مفعل أو لا يملك صلاحيات تشغيلية.');
        setLoading(false);
        return;
      }

      if (profile.role === 'super_admin') {
        router.push(redirectTo.startsWith('/bh-sovereign-vault') ? redirectTo : '/bh-sovereign-vault');
      } else if (profile.role === 'owner') {
        router.push(redirectTo.startsWith('/owner-studio') ? redirectTo : '/owner-studio');
      } else {
        router.push('/staff/orders');
      }
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f4f1eb] px-4 text-[#201e1a]">
      <div className="w-full max-w-md rounded-sm border border-[#ded8cd] bg-[#fbfaf7] p-8 shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-sm bg-[#20201c] font-black text-[#f4f1eb]">
            BH
          </div>
          <h1 className="text-2xl font-extrabold text-[#201e1a]">بوابة الدخول الموثقة — BURGER HOUSE</h1>
          <p className="text-xs text-[#777064]">
            مصادقة خادمية عبر Supabase Auth • يتم التحقق من الدور والفرع تلقائياً على الخادم
          </p>
        </div>

        <a href="/" className="block text-center text-xs font-bold text-[#a65e36] underline underline-offset-4">العودة إلى واجهة العميل</a>\n        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#9E9488] mb-1">البريد الإلكتروني الوظيفي</label>
            <input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@burgerhouse.sa"
              className="w-full rounded-xl border border-[#d8d0c4] bg-white px-4 py-3 text-sm text-[#F5EFE6] focus:border-[#a65e36] focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#9E9488] mb-1">كلمة المرور</label>
            <input type="password" required dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full rounded-xl border border-white/15 bg-[#0B0A09] px-4 py-3 text-sm text-[#F5EFE6] focus:border-[#D49A3A] focus:outline-none" />
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
              {errorMsg}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-[#a65e36] py-3.5 text-sm font-black text-white shadow-none disabled:opacity-50">
            {loading ? 'جاري التحقق من الجلسة والصلاحيات...' : 'تسجيل الدخول الآمن'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function StaffAndAdminLoginPage() {
  return (
    <Suspense fallback={<div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#0B0A09] text-[#F5EFE6]">جاري التحميل...</div>}>
      <StaffAndAdminLoginContent />
    </Suspense>
  );
}
