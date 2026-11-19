'use client';

import React,{Suspense,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {ArrowRight,LockKeyhole,ShieldCheck,Store} from 'lucide-react';
import {createSupabaseBrowserClient} from '@/lib/supabase/client';

function LoginContent(){
 const router=useRouter(),params=useSearchParams(),redirectTo=params.get('redirectTo')||'';
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setLoading(true);setError('');try{const sb=createSupabaseBrowserClient();const {data,error:authError}=await sb.auth.signInWithPassword({email:email.trim(),password});if(authError||!data.user)throw new Error('بيانات الدخول غير صحيحة أو الحساب غير مسجل.');const {data:profile,error:profileError}=await sb.from('user_profiles').select('role,is_active').eq('id',data.user.id).single();if(profileError||!profile||!profile.is_active){await sb.auth.signOut();throw new Error('هذا الحساب غير مفعل أو لا يملك صلاحية تشغيلية.');}const safeRedirect=redirectTo.startsWith('/')&&!redirectTo.startsWith('//')?redirectTo:'';if(profile.role==='super_admin')router.push(safeRedirect.startsWith('/bh-sovereign-vault')?safeRedirect:'/bh-sovereign-vault');else if(profile.role==='owner')router.push(safeRedirect.startsWith('/owner-studio')?safeRedirect:'/owner-studio');else router.push('/staff/orders');router.refresh();}catch(e:any){setError(e.message||'تعذر تسجيل الدخول.');}finally{setLoading(false);}};
 return <main dir="rtl" className="grid min-h-screen bg-[#f4f5f2] lg:grid-cols-[1fr_1fr]">
  <section className="relative hidden min-h-screen overflow-hidden bg-[#202820] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
   <div className="absolute inset-0 opacity-30"><img src="/images/hero-wagyu-smash.jpg" alt="" className="h-full w-full object-cover"/></div><div className="absolute inset-0 bg-gradient-to-t from-[#151c17] via-[#202820]/80 to-[#202820]/55"/>
   <div className="relative z-10 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center bg-[#d66b42] text-sm font-black">BH</div><div><div className="text-sm font-black tracking-[.18em]">BURGER HOUSE</div><div className="mt-1 text-[9px] tracking-[.22em] text-white/45">OPERATIONS PORTAL</div></div></div>
   <div className="relative z-10 max-w-xl"><div className="mb-5 flex items-center gap-3 text-[10px] font-black tracking-[.24em] text-[#f0a078]"><span className="h-px w-9 bg-[#f0a078]"/> TEAM ACCESS</div><h1 className="text-5xl font-black leading-[1.3]">كل فرع يعمل<br/><span className="text-[#f0a078]">بإيقاع واحد.</span></h1><p className="mt-6 max-w-md text-sm leading-8 text-white/65">بوابة تشغيل موحدة لموظفي الفروع والإدارة. صلاحيات الحساب تُحدد من الخادم وفق دور المستخدم والفرع المعيّن له.</p><div className="mt-8 flex flex-wrap gap-3 text-xs text-white/70"><span className="flex items-center gap-2 border border-white/15 px-4 py-3"><ShieldCheck size={15}/> صلاحيات محمية</span><span className="flex items-center gap-2 border border-white/15 px-4 py-3"><Store size={15}/> تشغيل الفروع</span></div></div>
   <div className="relative z-10 text-[10px] text-white/35">© {new Date().getFullYear()} BURGER HOUSE</div>
  </section>
  <section className="flex min-h-screen items-center justify-center px-5 py-12">
   <div className="w-full max-w-[440px]">
    <a href="/" className="mb-12 inline-flex items-center gap-2 text-xs font-bold text-[#777d73] hover:text-[#c65c34]"><ArrowRight size={15}/> العودة إلى واجهة العملاء</a>
    <div className="mb-8 lg:hidden"><div className="flex h-12 w-12 items-center justify-center bg-[#202820] text-sm font-black text-white">BH</div><div className="mt-4 text-sm font-black tracking-widest">BURGER HOUSE</div></div>
    <div className="flex items-center gap-2 text-[10px] font-black tracking-[.22em] text-[#c65c34]"><LockKeyhole size={14}/> SECURE SIGN IN</div>
    <h2 className="mt-3 text-3xl font-black">تسجيل الدخول</h2><p className="mt-2 text-sm leading-7 text-[#777d73]">أدخل بيانات حسابك الوظيفي للوصول إلى لوحة التشغيل المخصصة لك.</p>
    <form onSubmit={submit} className="mt-9 space-y-5">
     <label className="block text-xs font-black">البريد الإلكتروني<input type="email" required autoComplete="username" dir="ltr" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@burgerhouse.sa" className="mt-2 h-13 w-full border border-[#dfe3db] bg-white px-4 py-4 text-sm outline-none focus:border-[#c65c34]"/></label>
     <label className="block text-xs font-black">كلمة المرور<input type="password" required autoComplete="current-password" dir="ltr" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••••" className="mt-2 h-13 w-full border border-[#dfe3db] bg-white px-4 py-4 text-sm outline-none focus:border-[#c65c34]"/></label>
     {error&&<div className="border border-red-200 bg-red-50 p-3 text-xs font-bold leading-6 text-red-700">{error}</div>}
     <button type="submit" disabled={loading} className="flex h-14 w-full items-center justify-center gap-2 bg-[#c65c34] text-sm font-black text-white transition hover:bg-[#ad4d2b] disabled:opacity-50">{loading?'جارٍ التحقق من الحساب...':'دخول إلى لوحة العمل'}<ArrowRight size={16}/></button>
    </form>
    <div className="mt-8 border-t border-[#e3e6df] pt-5 text-[10px] leading-6 text-[#858b81]">لا تملك حساباً؟ تواصل مع مالك المطعم أو مسؤول النظام. لا تشارك كلمة المرور مع أي شخص.</div>
   </div>
  </section>
 </main>;
}
export default function StaffAndAdminLoginPage(){return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#f4f5f2] text-sm">جاري التحميل...</div>}><LoginContent/></Suspense>;}
