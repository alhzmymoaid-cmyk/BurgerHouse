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
    <div dir="rtl" className="min-h-screen bg-[#0B0A09] p-6 text-[#F5EFE6]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#D49A3A]">شاشة تشغيل الطلبات المباشرة (Realtime KDS / POS)</h1>
          <p className="text-xs text-[#9E9488]">
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
            className="rounded-xl border border-white/15 bg-[#141210] px-3 py-2 text-xs"
          />
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="rounded-xl border border-white/15 px-4 py-2 text-xs font-bold"
          >
            {soundEnabled ? '🔔 التنبيه الصوتي مفعل' : '🔕 التنبيه الصوتي صامت'}
          </button>
        </div>
      </header>

      {errorBanner && (
        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-xs font-bold text-red-300">
          {errorBanner}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {orders
          .filter((o) =>
            searchQuery
              ? o.order_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                o.customer_phone?.includes(searchQuery)
              : true
          )
          .map((order) => {
            const nextStatuses = ((VALID_STATUS_TRANSITIONS as any)[order.status] || []).filter((st: string) =>
              allowedRoleTargets.includes(st)
            );
            return (
              <div key={order.order_code} className="rounded-2xl border border-white/10 bg-[#141210] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <span className="font-mono text-lg font-extrabold text-[#D49A3A]">{order.order_code}</span>
                  <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold">
                    {(ORDER_STATUS_META as any)[order.status]?.label_ar || order.status}
                  </span>
                </div>
                <div className="text-xs space-y-1">
                  <div>العميل: <strong>{order.customer_name}</strong> ({order.customer_phone})</div>
                  <div>الإجمالي: <strong className="text-emerald-400">{order.total_amount} ر.س</strong></div>
                </div>
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
                      className="rounded-lg bg-[#D49A3A] px-3 py-1.5 text-xs font-bold text-[#0B0A09]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#141210] p-6 space-y-4">
            <h3 className="text-lg font-bold text-red-400">تأكيد إجراء حساس ({pendingSensitive.code})</h3>
            <input
              type="text"
              value={sensitiveReason}
              onChange={(e) => setSensitiveReason(e.target.value)}
              placeholder="اكتب سبب الرفض أو الإلغاء..."
              className="w-full rounded-xl border border-white/15 bg-[#0B0A09] px-3 py-2 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingSensitive(null)} className="rounded-xl border border-white/15 px-4 py-2 text-xs">تراجع</button>
              <button
                onClick={() => executeStatusTransition(pendingSensitive.code, pendingSensitive.status, true, sensitiveReason)}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white"
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
