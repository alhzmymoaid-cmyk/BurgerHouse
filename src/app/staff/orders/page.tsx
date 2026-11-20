'use client';

import BranchCatalogControls from '@/components/branch-catalog-controls';

import PromoManager from '@/components/promo-manager';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ORDER_STATUS_META,
  VALID_STATUS_TRANSITIONS,
  ROLE_ALLOWED_TARGET_STATUSES
} from '@/lib/domain/core-engine.mjs';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const decodeVapidKey = (value: string) => {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

export default function StaffLiveOrdersPage() {
  const router = useRouter();
  const [actorProfile, setActorProfile] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [pendingSensitive, setPendingSensitive] = useState<{ code: string; status: string } | null>(null);
  const [sensitiveReason, setSensitiveReason] = useState<string>('');
  const [busyOrderCode, setBusyOrderCode] = useState<string | null>(null);

  const playChime = useCallback(() => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {
      // Ignore audio errors before user gesture
    }
  }, [soundEnabled]);

  const enablePushNotifications = async () => {
    setPushBusy(true);
    setPushMessage('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('هذا المتصفح لا يدعم إشعارات الويب. افتح لوحة الموظف في Chrome أو ثبّت الموقع على شاشة iPhone الرئيسية أولاً.');
      }
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIos && !isStandalone) {
        throw new Error('على iPhone: أضف الموقع إلى الشاشة الرئيسية وافتح تطبيق BURGER HOUSE منها، ثم فعّل الإشعارات.');
      }
      const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error('مفتاح الإشعارات غير مضاف إلى إعدادات النشر.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('لم تسمح بإرسال الإشعارات. فعّلها من إعدادات المتصفح.');
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(publicKey)
      });
      const response = await fetch('/api/staff/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON(), branch_id: actorProfile?.assigned_branch_id || undefined })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || 'تعذر حفظ اشتراك الإشعارات.');
      setPushEnabled(true);
      setPushMessage('تم تفعيل إشعارات الطلبات لهذا الفرع على هذا الجهاز.');
    } catch (error: any) {
      setPushMessage(error?.message || 'تعذر تفعيل الإشعارات.');
    } finally {
      setPushBusy(false);
    }
  };

  const sendTestPush = async () => {
    setPushBusy(true);
    setPushMessage('');
    try {
      const response = await fetch('/api/staff/push/test', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === 'NO_PUSH_SUBSCRIPTION' ? 'فعّل الإشعارات على هذا الجهاز أولاً.' : result.message || result.error || 'فشل اختبار الإشعار.');
      setPushMessage('أرسلنا إشعار اختبار إلى هذا الجهاز.');
    } catch (error: any) {
      setPushMessage(error?.message || 'تعذر اختبار الإشعار.');
    } finally {
      setPushBusy(false);
    }
  };

  const fetchLiveOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders?status=all', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.error || 'غير مصرح بالوصول — يرجى تسجيل الدخول بحساب موظف الفرع');
        return;
      }
      setActorProfile(data.actor_profile);
      setOrders(data.orders || []);
    } catch (err: any) {
      setErrorBanner(err?.message || 'تعذر الاتصال بخادم الطلبات');
    }
  }, []);

  useEffect(() => {
    fetchLiveOrders();
  }, [fetchLiveOrders]);

  // Poll as a resilient fallback so orders still appear if a device/browser misses a Realtime event.
  useEffect(() => {
    const timer = window.setInterval(() => { fetchLiveOrders(); }, 10000);
    return () => window.clearInterval(timer);
  }, [fetchLiveOrders]);

  // Subscribe to Supabase Realtime on public.orders
  useEffect(() => {
    try {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel('staff-kds-live-orders')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              playChime();
            }
            fetchLiveOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      return undefined;
    }
  }, [fetchLiveOrders, playChime]);

  /**
   * Server-Authenticated Status Transition:
   * Sends ONLY `target_status`, `confirmed`, and `reason_note`.
   * NEVER sends `actor` or `order` from the browser!
   */
  const executeStatusTransition = async (orderCode: string, targetStatus: string, confirmed = false, reasonNote = '') => {
    setErrorBanner(null);
    setBusyOrderCode(orderCode);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderCode)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_status: targetStatus,
          confirmed,
          reason_note: reasonNote
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.message || data.error || 'تعذر تحديث حالة الطلب');
        return;
      }
      setPendingSensitive(null);
      setSensitiveReason('');
      await fetchLiveOrders();
    } catch (error: any) {
      setErrorBanner(error?.message || 'تعذر الاتصال بالخادم لتحديث الطلب');
    } finally {
      setBusyOrderCode(null);
    }
  };

  const logout = async () => {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace('/auth/login');
    router.refresh();
  };

  const statusFilters = [
    { id: 'all', label: 'كل الطلبات' },
    { id: 'new', label: 'جديدة' },
    { id: 'accepted', label: 'مقبولة' },
    { id: 'preparing', label: 'قيد التجهيز' },
    { id: 'ready_for_pickup', label: 'جاهزة للاستلام' },
    { id: 'completed', label: 'مكتملة' },
  ];

  const primaryAction: Record<string, { target: string; label: string }> = {
    new: { target: 'accepted', label: 'قبول الطلب' },
    pending_confirmation: { target: 'accepted', label: 'تأكيد وقبول الطلب' },
    accepted: { target: 'preparing', label: 'بدء التجهيز' },
    preparing: { target: 'ready_for_pickup', label: 'الطلب جاهز للاستلام' },
    ready_for_pickup: { target: 'completed', label: 'تأكيد التسليم' },
  };

  const allowedRoleTargets = actorProfile
    ? (ROLE_ALLOWED_TARGET_STATUSES as any)[actorProfile.role] || []
    : [];

  return (
    <div dir="rtl" className="bh-staff-shell min-h-screen bg-[#f1efe9] p-3 text-[#201e1a] sm:p-6">
      <header className="mb-6 overflow-hidden rounded-3xl border border-[#30332b] bg-[#151812] text-[#f7f1df] shadow-[0_18px_55px_rgba(0,0,0,.12)]">
        <div className="flex flex-col gap-5 p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#f5c542]"><img src="/brand-mark.svg" alt="" className="h-10 w-10"/></div>
            <div><p className="text-[9px] font-black tracking-[.24em] text-[#f5c542]">BURGER HOUSE · LIVE KITCHEN</p><h1 className="mt-1 text-2xl font-black">مركز تشغيل الطلبات</h1><p className="mt-1 text-[11px] text-[#aaa995]">{actorProfile ? `${actorProfile.full_name} · ${actorProfile.role === 'kitchen_staff' ? 'فريق المطبخ' : actorProfile.role === 'cashier' ? 'الكاشير' : actorProfile.role === 'branch_manager' ? 'مدير الفرع' : 'الإدارة'} · ${actorProfile.assigned_branch_id || 'كل الفروع'}` : 'جارٍ التحقق من صلاحيات الموظف...'}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ابحث برقم الطلب أو الجوال" className="col-span-2 min-w-0 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white outline-none placeholder:text-[#777b6b] sm:w-56"/>
            <button onClick={() => setSoundEnabled((enabled) => !enabled)} className="rounded-xl border border-white/10 px-3 py-3 text-xs font-bold text-[#e8dfc8]">{soundEnabled ? 'الصوت يعمل' : 'الصوت صامت'}</button>
            <button disabled={pushBusy} onClick={enablePushNotifications} className="rounded-xl bg-[#f5c542] px-3 py-3 text-xs font-black text-[#17140b] disabled:opacity-50">{pushBusy ? 'جارٍ التفعيل...' : pushEnabled ? 'الإشعارات مفعلة' : 'تفعيل الإشعارات'}</button>
            <button disabled={pushBusy} onClick={sendTestPush} className="rounded-xl border border-white/10 px-3 py-3 text-xs font-bold text-[#e8dfc8] disabled:opacity-50">اختبار الإشعار</button>
            <button onClick={fetchLiveOrders} className="rounded-xl border border-white/10 px-3 py-3 text-xs font-bold text-[#e8dfc8]">تحديث الطلبات</button>
            <button onClick={logout} className="rounded-xl border border-[#a65e36]/50 px-3 py-3 text-xs font-bold text-[#e6b58e]">تسجيل الخروج</button>
          </div>
        </div>
      </header>
      {actorProfile?.role === 'branch_manager' && <><PromoManager /><BranchCatalogControls /></>}


      {pushMessage && <div className="mb-4 rounded-lg border border-[#68572b] bg-[#282313] p-3 text-xs font-bold text-[#f2df9d]" role="status">{pushMessage}</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#e2dfd6] bg-white p-4 shadow-sm"><p className="text-[10px] font-bold text-[#858477]">إجمالي الطلبات</p><p className="mt-2 text-3xl font-black tabular-nums">{orders.length}</p></div>
        <div className="rounded-2xl border border-[#f0dfb7] bg-[#fffaf0] p-4 shadow-sm"><p className="text-[10px] font-bold text-[#96743b]">تحتاج قبولًا</p><p className="mt-2 text-3xl font-black tabular-nums text-[#a65e36]">{orders.filter(o=>['new','pending_confirmation'].includes(o.status)).length}</p></div>
        <div className="rounded-2xl border border-[#f0dfb7] bg-[#fffaf0] p-4 shadow-sm"><p className="text-[10px] font-bold text-[#96743b]">قيد التجهيز</p><p className="mt-2 text-3xl font-black tabular-nums text-[#a66c22]">{orders.filter(o=>o.status==='preparing').length}</p></div>
        <div className="rounded-2xl border border-[#cce5d2] bg-[#f3fbf4] p-4 shadow-sm"><p className="text-[10px] font-bold text-[#4e7957]">جاهزة للاستلام</p><p className="mt-2 text-3xl font-black tabular-nums text-[#267a43]">{orders.filter(o=>o.status==='ready_for_pickup').length}</p></div>
      </div>
      <nav aria-label="تصفية الطلبات" className="mb-5 flex gap-2 overflow-x-auto pb-2">
        {statusFilters.map((filter) => <button key={filter.id} onClick={() => setStatusFilter(filter.id)} className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-black transition ${statusFilter===filter.id?'bg-[#20231b] text-white shadow-md':'border border-[#ddd8cc] bg-white text-[#6e695e] hover:bg-[#f1eee7]'}`}>{filter.label}{filter.id==='all' ? ` · ${orders.length}` : ` · ${orders.filter(o=>o.status===filter.id).length}`}</button>)}
      </nav>
      {errorBanner && (
        <div className="mb-4 rounded-sm border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
          {errorBanner}
        </div>
      )}

      <div className="grid items-start gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {orders
          .filter((order) => (statusFilter === 'all' || order.status === statusFilter) && (
            !searchQuery ||
            String(order.order_number ?? '').includes(searchQuery) ||
            String(order.order_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            String(order.customer_phone || '').includes(searchQuery) ||
            String(order.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase())
          ))
          .map((order) => {
            const nextStatuses = ((VALID_STATUS_TRANSITIONS as any)[order.status] || []).filter((st: string) => allowedRoleTargets.includes(st));
            const action = primaryAction[order.status];
            const canAdvance = Boolean(action && nextStatuses.includes(action.target));
            const sensitiveStatuses = nextStatuses.filter((status: string) => status === 'rejected' || status === 'cancelled');
            return (
              <article key={order.order_code} className="overflow-hidden rounded-3xl border border-[#e2dfd6] bg-white shadow-[0_12px_34px_rgba(32,29,22,.07)]">
                <div className="flex items-center justify-between gap-3 border-b border-[#eeeae2] bg-[#fbfaf7] px-4 py-4">
                  <div><p className="text-[9px] font-black tracking-[.15em] text-[#a65e36]">ORDER NUMBER</p><p className="mt-1 font-mono text-2xl font-black tabular-nums text-[#29251f]">#{order.order_number ?? '—'}</p></div>
                  <div className="text-left"><span className="inline-flex rounded-full bg-[#eee9df] px-3 py-2 text-[10px] font-black text-[#655e53]">{(ORDER_STATUS_META as any)[order.status]?.label_ar || order.status}</span><p className="mt-2 text-[9px] text-[#969083]">{order.created_at ? new Date(order.created_at).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}) : ''}</p></div>
                </div>
                <div className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="text-[9px] font-bold text-[#969083]">العميل</p><p className="mt-1 truncate text-sm font-black text-[#28251f]">{order.customer_name}</p><a href={`tel:${order.customer_phone}`} dir="ltr" className="mt-1 inline-block text-xs font-bold text-[#8e6448]">{order.customer_phone}</a></div>
                    <div className="shrink-0 text-left"><p className="text-[9px] font-bold text-[#969083]">الإجمالي</p><p className="mt-1 text-lg font-black tabular-nums text-[#34754a]">{Number(order.total_amount).toFixed(2)} ر.س</p></div>
                  </div>
                  <div className="rounded-2xl bg-[#f7f5ef] p-3">
                    <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-black text-[#766f62]">تفاصيل الأصناف</p><p className="text-[9px] text-[#969083]">{order.branch_snapshot?.name_ar || 'فرع برجر هاوس'}</p></div>
                    <div className="space-y-3">{(order.order_items || []).map((item:any,index:number)=><div key={item.id || index} className="flex items-start justify-between gap-3 text-xs"><div className="min-w-0"><p className="font-black leading-5 text-[#343027]">{item.product_name_ar || 'صنف'}</p><p className="mt-0.5 text-[10px] text-[#80796d]">{item.size_name_ar || ''}{item.item_notes ? ' · '+item.item_notes : ''}</p></div><span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[10px] font-black text-[#514b40]">× {item.quantity}</span></div>)}</div>
                  </div>
                  {order.customer_notes && <p className="rounded-xl border border-[#eee1cb] bg-[#fffaf0] p-3 text-[11px] leading-6 text-[#765e3e]">ملاحظة العميل: {order.customer_notes}</p>}
                  <div className="space-y-2">
                    {canAdvance && <button disabled={busyOrderCode===order.order_code} onClick={() => executeStatusTransition(order.order_code,action.target,false,'تحديث من شاشة تشغيل الفرع')} className={`w-full rounded-2xl px-4 py-4 text-sm font-black text-white shadow-sm transition disabled:opacity-50 ${action.target==='ready_for_pickup'?'bg-emerald-600 hover:bg-emerald-700':action.target==='completed'?'bg-[#292d25] hover:bg-black':'bg-[#a65e36] hover:bg-[#814728]'}`}>{busyOrderCode===order.order_code?'جارٍ تحديث الطلب...':action.label}</button>}
                    {sensitiveStatuses.length>0 && <div className="flex gap-2">{sensitiveStatuses.map((nextSt:string)=><button key={nextSt} onClick={()=>setPendingSensitive({code:order.order_code,status:nextSt})} className="flex-1 rounded-xl border border-[#eadbd2] px-3 py-2.5 text-[10px] font-black text-[#a34c39]">{nextSt==='rejected'?'رفض الطلب':'إلغاء الطلب'}</button>)}</div>}
                    {!canAdvance && sensitiveStatuses.length===0 && <p className="rounded-xl bg-[#f5f4ef] px-3 py-3 text-center text-[10px] font-bold text-[#898477]">لا توجد إجراءات متاحة لهذا الدور أو لحالة الطلب.</p>}
                  </div>
                </div>
              </article>
            );
          })}
        {orders.filter((order) => (statusFilter === 'all' || order.status === statusFilter) && (!searchQuery || String(order.order_number ?? '').includes(searchQuery) || String(order.customer_phone || '').includes(searchQuery))).length===0 && <div className="col-span-full rounded-3xl border border-dashed border-[#d8d2c5] bg-white p-12 text-center"><p className="text-lg font-black text-[#3a352d]">لا توجد طلبات في هذا القسم</p><p className="mt-2 text-xs text-[#8b8376]">ستظهر الطلبات الجديدة هنا تلقائيًا عند وصولها.</p></div>}
      </div>

      {pendingSensitive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-sm border border-red-200 bg-[#fbfaf7] p-6 text-[#201e1a] space-y-4">
            <h3 className="text-lg font-bold text-red-400">تأكيد إجراء حساس ({pendingSensitive.code})</h3>
            <input
              type="text"
              value={sensitiveReason}
              onChange={(e) => setSensitiveReason(e.target.value)}
              placeholder="اكتب سبب الرفض أو الإلغاء..."
              className="w-full rounded-xl border border-[#d8d0c4] bg-white px-3 py-2 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingSensitive(null)} className="rounded-sm border border-[#d8d0c4] px-4 py-2 text-xs">تراجع</button>
              <button
                onClick={() => executeStatusTransition(pendingSensitive.code, pendingSensitive.status, true, sensitiveReason)}
                className="rounded-sm bg-red-700 px-4 py-2 text-xs font-bold text-white"
              >
                تأكيد التنفيذ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
