'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseCustomerBrowserClient } from '@/lib/supabase/client';
import { ArrowRight, Clock3, Printer, RefreshCw, CheckCircle2 } from 'lucide-react';

const labels: Record<string,string> = {
  new: 'بانتظار قبول الفرع',
  pending_confirmation: 'بانتظار التأكيد',
  accepted: 'تم قبول الطلب — قيد التجهيز',
  preparing: 'قيد التجهيز',
  ready_for_pickup: 'جاهز للاستلام',
  completed: 'تم تسليم الطلب',
  rejected: 'تعذر تنفيذ الطلب',
  cancelled: 'تم إلغاء الطلب',
};
const steps = [
  { status:'new', label:'استلام الطلب' },
  { status:'accepted', label:'قبول الطلب' },
  { status:'preparing', label:'قيد التجهيز' },
  { status:'ready_for_pickup', label:'جاهز للاستلام' },
  { status:'completed', label:'تم التسليم' },
];
const money=(n:number)=>new Intl.NumberFormat('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
const decodeVapidKey=(key:string)=>{const padding='='.repeat((4-key.length%4)%4);const base64=(key+padding).replace(/-/g,'+').replace(/_/g,'/');const raw=window.atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));};

export default function CustomerOrderTrackingPage() {
  const params=useParams<{id:string}>();
  const router=useRouter();
  const orderId=String(params?.id||'');
  const [order,setOrder]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [pushBusy,setPushBusy]=useState(false);
  const [pushEnabled,setPushEnabled]=useState(false);
  const [pushMessage,setPushMessage]=useState('');
  const previousStatus=useRef<string|null>(null);

  useEffect(()=>{
    if(!orderId) return;
    let active=true;
    const supabase=createSupabaseCustomerBrowserClient();
    const load=async()=>{
      try{
        const response=await fetch('/api/orders/mine',{cache:'no-store',credentials:'same-origin'});
        if(response.status===401){router.replace('/login');return;}
        const data=await response.json();
        if(!response.ok) throw new Error('تعذر تحميل بيانات الطلب.');
        const found=(data.orders||[]).find((item:any)=>item.id===orderId);
        if(!found) throw new Error('الطلب غير موجود في حسابك.');
        if(!active) return;
        if(previousStatus.current && previousStatus.current!=='ready_for_pickup' && found.status==='ready_for_pickup' && 'Notification' in window && Notification.permission==='granted'){
          try{new Notification('طلبك جاهز للاستلام',{body:'يمكنك التوجه إلى الفرع لاستلام طلبك.'});}catch{}
        }
        previousStatus.current=found.status;
        setOrder(found);
        setError('');
      }catch(e:any){if(active)setError(e.message||'حدث خطأ أثناء تحميل الطلب.');}
      finally{if(active)setLoading(false);}
    };
    void load();
    const channel=supabase.channel('customer-order-'+orderId)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders',filter:'id=eq.'+orderId},()=>{void load();})
      .subscribe();
    const fallback=window.setInterval(()=>{void load();},20000);
    return()=>{active=false;window.clearInterval(fallback);void supabase.removeChannel(channel);};
  },[orderId,router]);

  const enablePush=async()=>{
    setPushBusy(true);setPushMessage('');
    try{
      if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('هذا المتصفح لا يدعم إشعارات الويب.');
      const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
      const isStandalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true;
      if(isIOS&&!isStandalone)throw new Error('على iPhone، أضف التطبيق إلى الشاشة الرئيسية أولاً ثم فعّل الإشعارات.');
      const publicKey=process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
      if(!publicKey)throw new Error('خدمة الإشعارات غير مهيأة حاليًا.');
      const permission=await Notification.requestPermission();
      if(permission!=='granted')throw new Error('لم تسمح بإرسال الإشعارات لهذا الجهاز.');
      const registration=await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const existing=await registration.pushManager.getSubscription();
      const subscription=existing||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeVapidKey(publicKey)});
      const response=await fetch('/api/customer/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({subscription})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.message_ar||'تعذر حفظ اشتراك الإشعارات.');
      setPushEnabled(true);setPushMessage('تم تفعيل إشعارات جاهزية الطلب على هذا الجهاز.');
    }catch(e:any){setPushMessage(e.message||'تعذر تفعيل الإشعارات.');}
    finally{setPushBusy(false);}
  };

  const activeStep=order?.status==='pending_confirmation'?0:steps.findIndex(step=>step.status===order?.status);
  const rejected=['rejected','cancelled'].includes(order?.status);

  return <main dir="rtl" className="bh-orders min-h-screen">
    <header className="border-b border-white/10">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <a href="/" className="flex items-center gap-3"><img src="/brand-mark.svg" className="h-10 w-10" alt=""/><b className="tracking-[.1em]">BURGER HOUSE</b></a>
        <a href="/account/orders" className="inline-flex items-center gap-2 text-xs font-bold text-[#F2B705]"><ArrowRight size={15}/> طلباتي</a>
      </div>
    </header>
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <div className="mb-7">
        <span className="text-[10px] font-semibold tracking-[.18em] text-[#F2B705]">ORDER TRACKING</span>
        <h1 className="mt-2 text-3xl font-bold">متابعة الطلب</h1>
        <p className="mt-2 text-sm text-[#9E9BA3]">تتحدث حالة الطلب تلقائيًا عند تحديثها من الفرع.</p>
      </div>
      {loading?<div className="h-64 animate-pulse rounded-2xl bg-[#141417]"/>:error?<div className="rounded-xl border border-red-500/30 bg-[#1B1B1F] p-5 text-sm text-red-300" role="alert">{error}<a href="/account/orders" className="mt-4 block font-bold text-[#F2B705]">العودة إلى طلباتي</a></div>:order&&<>
        {order.status==='ready_for_pickup'&&<div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-emerald-300" role="status" aria-live="polite"><CheckCircle2 size={22}/><div><b className="block text-sm">طلبك جاهز للاستلام</b><span className="mt-1 block text-xs">توجه إلى الفرع لاستلام طلبك.</span></div></div>}
        {!pushEnabled&&!['completed','rejected','cancelled'].includes(order.status)&&<div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#141417] p-4"><div><b className="block text-sm">تنبيه جاهزية الطلب</b><p className="mt-1 text-xs text-[#9E9BA3]">فعّل الإشعارات لتصلك رسالة فور جاهزية طلبك.</p>{pushMessage&&<p role="status" className="mt-2 text-[11px] text-[#F2B705]">{pushMessage}</p>}</div><button type="button" disabled={pushBusy} onClick={enablePush} className="rounded-lg bg-[#F2B705] px-4 py-3 text-xs font-bold text-[#0A0A0C] disabled:opacity-50">{pushBusy?'جارٍ التفعيل…':'تفعيل الإشعارات'}</button></div>}
        {rejected&&<div className="mb-5 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-300" role="status">حالة الطلب: {labels[order.status]}</div>}
        <section className="rounded-2xl border border-white/10 bg-[#141417] p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div><span className="text-xs text-[#9E9BA3]">رقم الطلب</span><div className="mt-1 text-3xl font-bold tabular-nums">#{order.order_number}</div><p className="mt-2 text-xs text-[#9E9BA3]">{new Date(order.created_at).toLocaleString('ar-SA')}</p></div>
            <div className="text-start"><span className="text-xs text-[#9E9BA3]">حالة الطلب</span><div className="mt-2 rounded-lg bg-[#1B1B1F] px-3 py-2 text-sm font-bold text-[#F2B705]" aria-live="polite">{labels[order.status]||order.status}</div></div>
          </div>
          {!rejected&&<div className="grid grid-cols-2 gap-3 py-6 sm:grid-cols-5">
            {steps.map((step,index)=>{const done=index<=activeStep;return <div key={step.status} className="flex items-center gap-2 sm:flex-col sm:items-center sm:text-center"><span className={done?'grid h-8 w-8 place-items-center rounded-full bg-[#F2B705] text-[#0A0A0C]':'grid h-8 w-8 place-items-center rounded-full border border-white/15 text-[#9E9BA3]'}>{done?<CheckCircle2 size={16}/>:index+1}</span><span className={done?'text-[11px] font-semibold text-[#F6F3EC]':'text-[11px] text-[#9E9BA3]'}>{step.label}</span></div>;})}
          </div>}
          <div className="grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2">
            <div><span className="text-xs text-[#9E9BA3]">فرع الاستلام</span><p className="mt-1 text-sm font-semibold">{order.branch_snapshot?.name_ar||'BURGER HOUSE'}</p></div>
            <div><span className="text-xs text-[#9E9BA3]">الوقت المتوقع للاستلام</span><p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold tabular-nums"><Clock3 size={15}/>{order.estimated_pickup_at?new Date(order.estimated_pickup_at).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}):'يحدده الفرع'}</p></div>
          </div>
          <div className="mt-6 border-t border-white/10 pt-5">
            <h2 className="text-base font-bold">تفاصيل الطلب</h2>
            <div className="mt-4 space-y-3">{(order.order_items||[]).map((item:any)=><div key={item.id} className="flex justify-between gap-4 text-sm"><span className="min-w-0">{item.quantity} × {item.product_name_ar}{item.size_name_ar?' · '+item.size_name_ar:''}{(item.addons_snapshot||[]).length?' · '+item.addons_snapshot.map((addon:any)=>addon.name_ar).join('، '):''}{item.item_notes?' · '+item.item_notes:''}</span><b className="shrink-0 tabular-nums">{money(Number(item.line_total))} ر.س</b></div>)}</div>
            <div className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
              <div className="flex justify-between text-[#9E9BA3]"><span>المجموع الفرعي</span><span className="tabular-nums">{money(Number(order.subtotal))} ر.س</span></div>
              {Number(order.discount_amount)>0&&<div className="flex justify-between text-emerald-300"><span>الخصم {order.coupon_code?'('+order.coupon_code+')':''}</span><span className="tabular-nums">−{money(Number(order.discount_amount))} ر.س</span></div>}
              <div className="flex justify-between text-[#9E9BA3]"><span>ضريبة القيمة المضافة</span><span className="tabular-nums">{money(Number(order.vat_amount))} ر.س</span></div>
              <div className="flex justify-between border-t border-white/10 pt-3 text-base font-bold"><span>الإجمالي</span><span className="tabular-nums text-[#F2B705]">{money(Number(order.total_amount))} ر.س</span></div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={()=>window.print()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3 text-xs font-bold"><Printer size={15}/> طباعة الفاتورة</button>
            <button type="button" onClick={()=>window.location.reload()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3 text-xs font-bold text-[#F2B705]"><RefreshCw size={15}/> تحديث</button>
          </div>
        </section>
      </>}
    </div>
  </main>;
}
