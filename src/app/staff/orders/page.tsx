'use client';

import BranchCatalogControls from '@/components/branch-catalog-controls';

import PromoManager from '@/components/promo-manager';
import BranchCouponManager from '@/components/branch-coupon-manager';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ORDER_STATUS_META,
  VALID_STATUS_TRANSITIONS,
  ROLE_ALLOWED_TARGET_STATUSES
} from '@/lib/domain/core-engine.mjs';

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
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [branchProducts, setBranchProducts] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const soundEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const seenOrderCodesRef = useRef<Set<string> | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [pendingSensitive, setPendingSensitive] = useState<{ code: string; status: string } | null>(null);
  const [sensitiveReason, setSensitiveReason] = useState<string>('');
  const [busyOrderCode, setBusyOrderCode] = useState<string | null>(null);
  const [printOrderCode, setPrintOrderCode] = useState<string | null>(null);

  const playChime = useCallback(() => {
    if (!soundEnabledRef.current || !audioUnlockedRef.current) return;
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state !== 'running') return;
    try {
      const startAt = ctx.currentTime;
      [659.25, 880, 1046.5].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteStart = startAt + index * 0.14;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.22, noteStart + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.42);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.44);
      });
    } catch (error) {
      console.warn('Order chime could not be played:', error);
    }
  }, []);

  const toggleOrderSound = async () => {
    if (soundEnabledRef.current) {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) throw new Error('هذا المتصفح لا يدعم تشغيل الصوت.');
      if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
      await audioContextRef.current.resume();
      audioUnlockedRef.current = audioContextRef.current.state === 'running';
      if (!audioUnlockedRef.current) throw new Error('لم يسمح المتصفح بتشغيل الصوت. اضغط تفعيل الصوت مرة أخرى.');
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      playChime();
    } catch (error: any) {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      setPushMessage(error?.message || 'تعذر تفعيل صوت الطلبات.');
    }
  };

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
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription || await registration.pushManager.subscribe({
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
      const nextOrders = data.orders || [];
      const nextCodes = new Set<string>(nextOrders.map((order: any) => String(order.order_code || order.id)));
      const previouslySeen = seenOrderCodesRef.current;
      if (previouslySeen === null) {
        // Establish a baseline on first load; do not sound for old orders.
        seenOrderCodesRef.current = nextCodes;
      } else {
        const arrived = nextOrders.some((order: any) => {
          const code = String(order.order_code || order.id);
          return !previouslySeen.has(code) && ['new', 'pending_confirmation'].includes(order.status);
        });
        nextCodes.forEach((code) => previouslySeen.add(code));
        if (arrived) playChime();
      }
      setOrders(nextOrders);
    } catch (err: any) {
      setErrorBanner(err?.message || 'تعذر الاتصال بخادم الطلبات');
    }
  }, [playChime]);

  useEffect(() => {
    fetchLiveOrders();
  }, [fetchLiveOrders]);

  useEffect(() => {
    if (!actorProfile || !('serviceWorker' in navigator)) return;
    let active = true;
    void navigator.serviceWorker.getRegistration('/sw.js')
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setPushEnabled(Boolean(subscription));
      })
      .catch(() => {
        if (active) setPushEnabled(false);
      });
    return () => { active = false; };
  }, [actorProfile]);

  useEffect(() => {
    let active = true;
    const fetchBranchAvailability = async () => {
      try {
        const response = await fetch('/api/catalog', { cache: 'no-store' });
        const data = await response.json();
        if (!active || !response.ok) return;
        setCatalogProducts(data.products || []);
        setBranchProducts(data.branch_products || []);
      } catch {
        // The KDS remains usable if the read-only availability panel is offline.
      }
    };
    void fetchBranchAvailability();
    const timer = window.setInterval(() => { void fetchBranchAvailability(); }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

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
          () => {
            // Only ring for newly observed orders in the branch-authorized list.
            // Polling and Realtime share the same deduplication set.
            fetchLiveOrders();
          }
        )
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('Staff order Realtime subscription issue:', status, error);
          }
        });

      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      return undefined;
    }
  }, [fetchLiveOrders]);

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

  useEffect(() => {
    const clearPrintTarget = () => setPrintOrderCode(null);
    window.addEventListener('afterprint', clearPrintTarget);
    return () => window.removeEventListener('afterprint', clearPrintTarget);
  }, []);

  const printOrder = (orderCode: string) => {
    setPrintOrderCode(orderCode);
    window.setTimeout(() => window.print(), 120);
  };

  const logout = async () => {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace('/auth/login');
    router.refresh();
  };

  const statusFilters = [
    { id: 'all', label: 'كل الطلبات' },
    { id: 'new', label: 'جديدة' },
    { id: 'pending_confirmation', label: 'بانتظار التأكيد' },
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

  const unavailableProducts = branchProducts
    .filter((row) => {
      const branchMatches = !actorProfile?.assigned_branch_id || row.branch_id === actorProfile.assigned_branch_id;
      const soldOutUntil = row.sold_out_until ? new Date(row.sold_out_until).getTime() : 0;
      return branchMatches && (row.is_available === false || row.manual_disabled === true || soldOutUntil > Date.now());
    })
    .map((row) => catalogProducts.find((product) => product.id === row.product_id)?.name_ar || row.product_id);

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
            <button onClick={toggleOrderSound} className="rounded-xl border border-white/10 px-3 py-3 text-xs font-bold text-[#e8dfc8]">{soundEnabled ? 'صوت الطلبات يعمل' : 'تفعيل صوت الطلبات'}</button>
            <button disabled={pushBusy} onClick={enablePushNotifications} className="rounded-xl bg-[#f5c542] px-3 py-3 text-xs font-black text-[#17140b] disabled:opacity-50">{pushBusy ? 'جارٍ التفعيل...' : pushEnabled ? 'الإشعارات مفعلة' : 'تفعيل الإشعارات'}</button>
            <button disabled={pushBusy} onClick={sendTestPush} className="rounded-xl border border-white/10 px-3 py-3 text-xs font-bold text-[#e8dfc8] disabled:opacity-50">اختبار الإشعار</button>
            {actorProfile?.role === "branch_manager" && <a href="/manager/analytics" className="rounded-xl border border-white/10 px-3 py-3 text-center text-xs font-bold text-[#F2B705]">إحصائيات الفرع</a>}
            <button onClick={fetchLiveOrders} className="rounded-xl border border-white/10 px-3 py-3 text-xs font-bold text-[#e8dfc8]">تحديث الطلبات</button>
            <button onClick={logout} className="rounded-xl border border-[#a65e36]/50 px-3 py-3 text-xs font-bold text-[#e6b58e]">تسجيل الخروج</button>
          </div>
        </div>
      </header>
      {actorProfile?.role === 'branch_manager' && (
        <details className="mb-5 rounded-2xl border border-[#d8d0c1] bg-white p-4">
          <summary className="cursor-pointer text-sm font-black text-[#4b3a1d]">إدارة الفرع: المنيو والإعلانات وكوبونات الخصم</summary>
          <div className="mt-4 space-y-4">
            <BranchCatalogControls />
            <PromoManager />
            <BranchCouponManager />
          </div>
        </details>
      )}


      {pushMessage && <div className="mb-4 rounded-lg border border-[#68572b] bg-[#282313] p-3 text-xs font-bold text-[#f2df9d]" role="status">{pushMessage}</div>}

      {unavailableProducts.length > 0 && <section className="mb-5 rounded-xl border border-amber-500/25 bg-amber-950/20 p-4" aria-label="الأصناف المتوقفة في الفرع"><div className="text-xs font-bold text-amber-300">أصناف متوقفة حاليًا في الفرع</div><div className="mt-2 flex flex-wrap gap-2">{unavailableProducts.map((name,index)=><span key={name+index} className="rounded-md border border-amber-500/20 bg-[#1B1B1F] px-3 py-2 text-[11px] text-[#F6F3EC]">{name}</span>)}</div></section>}

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
            const terminalOrder = ['completed', 'rejected', 'cancelled'].includes(order.status);
            const elapsedMinutes = terminalOrder ? null : Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000));
            const timeTone = elapsedMinutes === null ? 'bg-white/5 text-[#9E9BA3] border-white/10' : elapsedMinutes >= 20 ? 'bg-red-950/40 text-red-300 border-red-500/30' : elapsedMinutes >= 12 ? 'bg-amber-950/40 text-amber-300 border-amber-500/30' : 'bg-white/5 text-[#9E9BA3] border-white/10';
            const sensitiveStatuses = nextStatuses.filter((status: string) => status === 'rejected' || status === 'cancelled');
            return (
              <article key={order.order_code} className={printOrderCode === order.order_code ? "bh-staff-order-card bh-print-order" : "bh-staff-order-card"}>
                <div className="flex items-center justify-between gap-3 border-b border-[#eeeae2] bg-[#fbfaf7] px-4 py-4">
                  <div><p className="text-[9px] font-black tracking-[.15em] text-[#a65e36]">ORDER NUMBER</p><p className="mt-1 font-mono text-2xl font-black tabular-nums text-[#29251f]">#{order.order_number ?? '—'}</p></div>
                  <div className="text-left"><span data-order-status={order.status} className="inline-flex rounded-full border border-white/10 bg-[#1B1B1F] px-3 py-2 text-[10px] font-black text-[#F2B705]">{(ORDER_STATUS_META as any)[order.status]?.label_ar || order.status}</span><p className="mt-2 text-[9px] text-[#9E9BA3]">{order.created_at ? new Date(order.created_at).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}) : ''}</p><div className="mt-2 flex flex-wrap justify-end gap-2"><span className={"rounded-md border px-2 py-1 text-[9px] font-bold tabular-nums " + timeTone}>{elapsedMinutes === null ? '—' : elapsedMinutes + ' دقيقة'}</span><button type="button" onClick={()=>printOrder(order.order_code)} className="no-print rounded-md border border-white/10 px-2 py-1 text-[9px] font-bold text-[#F2B705]">طباعة 80mm</button></div></div>
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
                    {canAdvance && <button disabled={busyOrderCode===order.order_code} onClick={() => executeStatusTransition(order.order_code,action.target,false,'تحديث من شاشة تشغيل الفرع')} className={"w-full rounded-xl px-4 py-4 text-sm font-black shadow-sm transition disabled:opacity-50 " + (action.target==='accepted'?'bg-[#F2B705] text-[#0A0A0C] hover:bg-[#FFCA28]':action.target==='ready_for_pickup'?'bg-emerald-600 text-white hover:bg-emerald-700':action.target==='completed'?'bg-[#292d25] text-white hover:bg-black':'bg-[#a65e36] text-white hover:bg-[#814728]')}>{busyOrderCode===order.order_code?'جارٍ تحديث الطلب...':action.label}</button>}
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
            <select
              required
              value={sensitiveReason}
              onChange={(e) => setSensitiveReason(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#1B1B1F] px-3 py-3 text-xs text-[#F6F3EC]"
            >
              <option value="">اختر سبب الرفض أو الإلغاء</option>
              <option value="نفاد الصنف">نفاد الصنف</option>
              <option value="الفرع مزدحم">الفرع مزدحم</option>
              <option value="تعذر تأكيد الطلب">تعذر تأكيد الطلب</option>
              <option value="سبب آخر">سبب آخر</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingSensitive(null)} className="rounded-sm border border-[#d8d0c4] px-4 py-2 text-xs">تراجع</button>
              <button
                disabled={!sensitiveReason.trim() || busyOrderCode===pendingSensitive.code}
                onClick={() => executeStatusTransition(pendingSensitive.code, pendingSensitive.status, true, sensitiveReason)}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
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
