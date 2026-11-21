'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseCustomerBrowserClient } from '@/lib/supabase/client';
import { ArrowRight, Clock3, ReceiptText, LogOut, RefreshCw, Link2 } from 'lucide-react';

const labels:Record<string,string>={new:'بانتظار قبول الفرع',pending_confirmation:'بانتظار التأكيد',accepted:'تم قبول الطلب',preparing:'قيد التجهيز',ready_for_pickup:'جاهز للاستلام',completed:'تم الاستلام',rejected:'مرفوض',cancelled:'ملغي'};
const money=(n:number)=>new Intl.NumberFormat('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);

export default function CustomerOrdersPage(){
  const router=useRouter();
  const [orders,setOrders]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [name,setName]=useState('');
  const [claimCode,setClaimCode]=useState('');
  const [claimToken,setClaimToken]=useState('');
  const [claiming,setClaiming]=useState(false);
  const [claimMessage,setClaimMessage]=useState('');
  const [claimError,setClaimError]=useState('');

  const load=useCallback(async(silent=false)=>{
    if(!silent)setLoading(true);
    setError('');
    try{
      const supabase=createSupabaseCustomerBrowserClient();
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace('/login');return;}
      setName(user.user_metadata?.full_name||'');
      const response=await fetch('/api/orders/mine',{cache:'no-store'});
      if(response.status===401){router.replace('/login');return;}
      const data=await response.json();
      if(!response.ok)throw new Error('تعذر تحميل الطلبات');
      setOrders(data.orders||[]);
    }catch(e:any){setError(e.message||'حدث خطأ أثناء تحميل الطلبات');}
    finally{if(!silent)setLoading(false);}
  },[router]);

  useEffect(()=>{
    void load();
    const timer=window.setInterval(()=>{void load(true);},15000);
    return()=>window.clearInterval(timer);
  },[load]);

  const signOut=async()=>{
    await createSupabaseCustomerBrowserClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const claimOrder=async(event:any)=>{
    event.preventDefault();
    setClaimError('');
    setClaimMessage('');
    if(!claimCode.trim()||!claimToken.trim()){
      setClaimError('أدخل رقم الطلب ورمز التتبع معًا.');
      return;
    }
    setClaiming(true);
    try{
      const response=await fetch('/api/account/claim-guest-order',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        cache:'no-store',
        body:JSON.stringify({order_code:claimCode.trim(),tracking_token:claimToken.trim()})
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.message_ar||'تعذر ربط الطلب. تحقق من بياناته.');
      setClaimMessage(result.already_claimed?'هذا الطلب مرتبط بحسابك بالفعل.':'تم ربط الطلب بحسابك بنجاح.');
      setClaimCode('');
      setClaimToken('');
      await load(true);
    }catch(e:any){setClaimError(e.message||'تعذر ربط الطلب الآن.');}
    finally{setClaiming(false);}
  };

  return <main dir="rtl" className="bh-orders min-h-screen">
    <header className="border-b border-white/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <a href="/" className="flex items-center gap-3"><img src="/brand-mark.svg" className="h-10 w-10" alt=""/><b className="tracking-[.1em]">BURGER HOUSE</b></a>
        <button onClick={signOut} className="inline-flex items-center gap-2 text-xs font-bold text-[#9E9BA3]"><LogOut size={15}/> تسجيل الخروج</button>
      </div>
    </header>
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <a href="/" className="inline-flex items-center gap-2 text-xs font-bold text-[#F2B705]"><ArrowRight size={15}/> العودة للمتجر</a>
      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <div><div className="text-[10px] font-semibold tracking-[.2em] text-[#F2B705]">YOUR ACCOUNT</div><h1 className="mt-2 text-3xl font-bold">طلباتي {name&&<span className="text-[#F2B705]">، {name}</span>}</h1><p className="mt-2 text-sm text-[#9E9BA3]">طلباتك السابقة والحالية وفواتيرك في مكان واحد.</p></div>
        <button onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3 text-xs font-bold"><RefreshCw size={14}/> تحديث</button>
      </div>

      <section className="mt-7 rounded-2xl border border-white/10 bg-[#141417] p-4 sm:p-5">
        <div className="flex items-center gap-2"><Link2 size={17} className="text-[#F2B705]"/><h2 className="text-sm font-bold">طلبت سابقًا كضيف؟</h2></div>
        <p className="mt-2 text-xs leading-6 text-[#9E9BA3]">اربط الطلب بحسابك باستخدام رقم الطلب ورمز التتبع الخاص به. لن يتم ربط أي طلب بمجرد تطابق رقم الجوال.</p>
        <form onSubmit={claimOrder} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
          <input dir="ltr" autoComplete="off" value={claimCode} onChange={e=>setClaimCode(e.target.value.toUpperCase().slice(0,40))} placeholder="رقم الطلب" className="min-h-11 rounded-lg border border-white/10 bg-[#1B1B1F] px-3 text-sm text-[#F6F3EC] outline-none focus:border-[#F2B705]"/>
          <input dir="ltr" autoComplete="off" spellCheck={false} value={claimToken} onChange={e=>setClaimToken(e.target.value.slice(0,256))} placeholder="رمز التتبع trk_..." className="min-h-11 rounded-lg border border-white/10 bg-[#1B1B1F] px-3 text-sm text-[#F6F3EC] outline-none focus:border-[#F2B705]"/>
          <button disabled={claiming} className="min-h-11 rounded-lg bg-[#F2B705] px-5 text-xs font-bold text-[#0A0A0C] disabled:opacity-50">{claiming?'جارٍ التحقق…':'ربط الطلب'}</button>
        </form>
        {claimError&&<p className="mt-3 text-xs text-red-300" role="alert">{claimError}</p>}
        {claimMessage&&<p className="mt-3 text-xs text-emerald-300" role="status">{claimMessage}</p>}
      </section>

      {loading?<div className="mt-8 h-48 animate-pulse rounded-2xl bg-[#141417]"/>:error?<p className="mt-8 rounded-xl border border-red-500/30 bg-[#1B1B1F] p-4 text-sm text-red-300">{error}</p>:orders.length===0?
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#141417] p-12 text-center"><ReceiptText className="mx-auto text-[#F2B705]" size={32}/><h2 className="mt-4 text-lg font-bold">لا توجد طلبات حتى الآن</h2><p className="mt-2 text-sm text-[#9E9BA3]">عندما تطلب من برجر هاوس ستجد تفاصيل طلباتك هنا.</p><a href="/#menu-section" className="mt-5 inline-flex rounded-lg bg-[#F2B705] px-6 py-3 text-sm font-bold text-[#0A0A0C]">تصفح المنيو</a></div>
        :<div className="mt-8 space-y-4">
          {orders.map(order=><article key={order.id} className="rounded-2xl border border-white/10 bg-[#141417] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="text-[10px] text-[#9E9BA3]">رقم الطلب</div><div className="mt-1 text-2xl font-bold tabular-nums">#{order.order_number}</div><div className="mt-2 text-xs text-[#9E9BA3]">{new Date(order.created_at).toLocaleString('ar-SA')}</div></div>
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-[#1B1B1F] px-3 py-2 text-xs font-bold text-[#F2B705]">{labels[order.status]||order.status}</span><a href={`/orders/${order.id}`} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] font-bold text-[#F2B705]">تتبع الطلب</a></div>
            </div>
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 text-xs font-bold"><Clock3 size={14}/>{order.branch_snapshot?.name_ar||'فرع برجر هاوس'}</div>
              <div className="mt-3 space-y-2">{(order.order_items||[]).map((item:any)=><div key={item.id} className="flex justify-between gap-3 text-xs"><span>{item.quantity} × {item.product_name_ar}{item.size_name_ar?' · '+item.size_name_ar:''}{(item.addons_snapshot||[]).length?' · '+item.addons_snapshot.map((a:any)=>a.name_ar).join('، '):''}{item.item_notes?' · '+item.item_notes:''}</span><b className="tabular-nums">{money(Number(item.line_total))} ر.س</b></div>)}</div>
              <div className="mt-4 space-y-2 border-t border-white/10 pt-3 text-xs">
                <div className="flex justify-between text-[#9E9BA3]"><span>المجموع قبل الضريبة</span><span>{money(Number(order.subtotal))} ر.س</span></div>
                {Number(order.discount_amount)>0&&<div className="flex justify-between text-emerald-300"><span>الخصم</span><span>−{money(Number(order.discount_amount))} ر.س</span></div>}
                <div className="flex justify-between text-[#9E9BA3]"><span>ضريبة القيمة المضافة</span><span>{money(Number(order.vat_amount))} ر.س</span></div>
                <div className="flex justify-between border-t border-white/10 pt-3 text-sm font-bold"><span>الإجمالي شامل الضريبة</span><span className="text-[#F2B705]">{money(Number(order.total_amount))} ر.س</span></div>
              </div>
              <button onClick={()=>window.print()} className="no-print mt-4 rounded-lg border border-white/10 px-3 py-2 text-[11px] font-bold">طباعة الفاتورة</button>
            </div>
          </article>)}
        </div>}
    </div>
  </main>;
}
