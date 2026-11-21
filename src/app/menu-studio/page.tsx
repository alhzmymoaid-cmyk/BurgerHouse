import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

export const dynamic = 'force-dynamic';

export default async function MenuStudioPage() {
  const auth = createSupabaseServerClient();
  const check = await requireAuthenticatedProfile(auth, ['super_admin', 'owner', 'branch_manager']);
  if (!check.ok && check.status === 401) redirect('/auth/login?redirectTo=/menu-studio');
  if (!check.ok) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#0A0A0C] px-4 py-10 text-[#FAFAFA]">
        <section className="w-full max-w-xl rounded-2xl border border-red-400/30 bg-[#16161A] p-7">
          <p className="text-xs font-black tracking-[.18em] text-red-300">BURGER HOUSE · ACCESS CONTROL</p>
          <h1 className="mt-3 text-xl font-black">هذا الحساب غير مخوّل لإدارة المنيو</h1>
          <p className="mt-3 text-sm leading-7 text-[#D4D4D8]">سجّل الدخول بحساب مالك أو مدير نظام، أو اطلب من مدير النظام منحك الصلاحية المناسبة. لم يتم تغيير أي صلاحية تلقائيًا.</p>
          <div className="mt-6 flex flex-wrap gap-2"><Link href="/staff/orders" className="rounded-xl border border-[#52525B] px-5 py-3 text-sm font-bold">واجهة الموظفين</Link><Link href="/" className="rounded-xl bg-[#F5B800] px-5 py-3 text-sm font-black text-[#09090B]">العودة للمتجر</Link></div>
        </section>
      </main>
    );
  }
  const allowed = ['super_admin', 'owner'].includes(check.profile.role)
    || (check.profile.role === 'branch_manager' && Array.isArray(check.profile.permissions) && check.profile.permissions.includes('catalog_manage'));

  return (
    <main dir="rtl" className="min-h-screen bg-[#0A0A0C] px-4 py-10 text-[#FAFAFA] sm:px-8">
      <section className="mx-auto max-w-3xl rounded-2xl border border-[#52525B] bg-[#16161A] p-6 sm:p-10">
        <p className="text-xs font-black tracking-[.18em] text-[#F5B800]">BURGER HOUSE · MENU STUDIO</p>
        <h1 className="mt-3 text-2xl font-black">استوديو إدارة المنيو</h1>
        <p className="mt-3 text-sm leading-7 text-[#D4D4D8]">إدارة المنتجات والأقسام والأسعار والإضافات والصور والإعلانات من خلال المنيو الأصلي.</p>
        {allowed ? (
          <Link href="/?admin=1" className="mt-7 inline-flex rounded-xl bg-[#F5B800] px-6 py-3.5 text-sm font-black text-[#09090B]">فتح المنيو الأصلي بوضع الإدارة</Link>
        ) : (
          <div className="mt-7 rounded-xl border border-amber-400/40 bg-amber-950/30 p-4 text-sm leading-7 text-amber-100">
            هذا الحساب لا يحمل صلاحية إدارة المنيو بعد. يجب على مدير النظام تفعيل صلاحية <b dir="ltr">catalog_manage</b> لهذا الحساب. لن تتغير صلاحيات الموظفين الآخرين.
          </div>
        )}
        <Link href="/" className="mr-3 inline-flex rounded-xl border border-[#52525B] px-5 py-3.5 text-sm font-bold text-[#E4E4E7]">العودة للمتجر</Link>
      </section>
    </main>
  );
}
