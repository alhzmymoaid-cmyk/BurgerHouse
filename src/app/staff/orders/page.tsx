'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ORDER_STATUS_META,
  VALID_STATUS_TRANSITIONS,
  ROLE_ALLOWED_TARGET_STATUSES
} from '@/lib/domain/core-engine.mjs';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function StaffLiveOrdersPage() {
  const [actorProfile, setActorProfile] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [pendingSensitive, setPendingSensitive] = useState<{ code: string; status: string } | null>(null);
  const [sensitiveReason, setSensitiveReason] = useState<string>('');

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

  const fetchLiveOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders?status=${encodeURIComponent(statusFilter)}`, { cache: 'no-store' });
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
  }, [statusFilter]);

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
  };

  const allowedRoleTargets = actorProfile
    ? (ROLE_ALLOWED_TARGET_STATUSES as any)[actorProfile.role] || []
    : [];

  return (
    <div dir="rtl" className="bh-staff-shell min-h-screen bg-[#f4f1eb] p-4 text-[#201e1a] sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#ded8cd] pb-4">
        <div>
          <div className="flex items-center gap-3"><img src="/brand-mark.svg" alt="" className="h-12 w-12"/><div><h1 className="text-2xl font-extrabold text-[#a65e36]">مركز تشغيل الطلبات</h1><p className="mt-1 text-[10px] tracking-[.16em] text-[#8a8175]">BURGER HOUSE · BRANCH OPERATIONS</p></div></div>
          <p className="text-xs text-[#777064]">
            {actorProfile
              ? `الموظف المصادق عليه خادمياً: ${actorProfile.full_name} (${actorProfile.role}) • الفرع المعزول: ${actorProfile.assigned_branch_id || 'جميع الفروع'}`
              : 'جاري التحقق من الجلسة الخادمية...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الطلب أو الجوال..."
            className="rounded-sm border border-[#d8d0c4] bg-white px-3 py-2 text-xs text-[#201e1a]"
          />
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="rounded-sm border border-[#d8d0c4] bg-white px-4 py-2 text-xs font-bold text-[#514b42]"
          >
            {soundEnabled ? '🔔 التنبيه الصوتي مفعل' : '🔕 التنبيه الصوتي صامت'}
          </button>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-[#ded8cd] bg-[#fbfaf7] p-4"><div className="text-[11px] text-[#81786d]">كل الطلبات</div><div className="mt-2 text-2xl font-black">{orders.length}</div></div>
        <div className="rounded-xl border border-[#ded8cd] bg-[#fbfaf7] p-4"><div className="text-[11px] text-[#81786d]">طلبات جديدة</div><div className="mt-2 text-2xl font-black text-[#a65e36]">{orders.filter(o=>['new','pending_confirmation'].includes(o.status)).length}</div></div>
        <div className="rounded-xl border border-[#ded8cd] bg-[#fbfaf7] p-4"><div className="text-[11px] text-[#81786d]">قيد التجهيز</div><div className="mt-2 text-2xl font-black text-[#9b6a25]">{orders.filter(o=>o.status==='preparing').length}</div></div>
        <div className="rounded-xl border border-[#ded8cd] bg-[#fbfaf7] p-4"><div className="text-[11px] text-[#81786d]">جاهزة للاستلام</div><div className="mt-2 text-2xl font-black text-[#426348]">{orders.filter(o=>o.status==='ready_for_pickup').length}</div></div>
      </div>
      {errorBanner && (
        <div className="mb-4 rounded-sm border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
          {errorBanner}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {orders
          .filter((o) =>
            searchQuery
              ? String(o.order_number ?? '').includes(searchQuery) || o.order_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                o.customer_phone?.includes(searchQuery)
              : true
          )
          .map((order) => {
            const nextStatuses = ((VALID_STATUS_TRANSITIONS as any)[order.status] || []).filter((st: string) =>
              allowedRoleTargets.includes(st)
            );
            return (
              <div key={order.order_code} className="rounded-2xl border border-[#ded8cd] bg-[#fbfaf7] p-5 shadow-[0_12px_30px_rgba(35,29,22,.06)] space-y-4">
                <div className="flex items-center justify-between border-b border-[#e4ded4] pb-3">
                  <span className="font-mono text-lg font-extrabold text-[#a65e36]">#{order.order_number ?? '—'}</span>
                  <span className="rounded-sm bg-[#eee8df] px-2.5 py-1 text-xs font-bold text-[#655e53]">
                    {(ORDER_STATUS_META as any)[order.status]?.label_ar || order.status}
                  </span>
                </div>
                <div className="text-xs space-y-1">
                  <div>العميل: <strong>{order.customer_name}</strong> ({order.customer_phone})</div>
                  <div>الإجمالي: <strong className="text-[#426348]">{order.total_amount} ر.س</strong></div>
                </div>
                {Array.isArray(order.order_items) && order.order_items.length > 0 && <div className="border-t border-[#e4ded4] pt-3"><div className="mb-2 text-[11px] font-black text-[#655e53]">تفاصيل الأصناف</div><div className="space-y-2">{order.order_items.map((item:any,index:number)=><div key={item.id || index} className="flex items-start justify-between gap-3 text-xs"><div><div className="font-bold">{item.product_name_ar || 'صنف'}</div><div className="mt-0.5 text-[10px] text-[#777064]">{item.size_name_ar || ''}{item.item_notes ? ' • '+item.item_notes : ''}</div></div><span className="shrink-0 font-bold">× {item.quantity}</span></div>)}</div></div>}
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map((nextSt: string) => (
                    <button
                      key={nextSt}
                      onClick={() => {
                        if (nextSt === 'rejected' || nextSt === 'cancelled') {
                          setPendingSensitive({ code: order.order_code, status: nextSt });
                        } else {
                          executeStatusTransition(order.order_code, nextSt, false, 'تحديث مباشر من شاشة الفرع');
                        }
                      }}
                      className="rounded-sm bg-[#a65e36] px-3 py-2 text-xs font-bold text-white"
                    >
                      {(ORDER_STATUS_META as any)[nextSt]?.label_ar}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
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
