'use client';

import PromoManager from '@/components/promo-manager';
import OwnerAnalyticsPanel from '@/components/owner-analytics-panel';

import React, { useState, useEffect, useCallback } from 'react';

export default function OwnerStudioDashboard() {
  const [data, setData] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/owner', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || 'غير مصرح بالدخول للوحة مالك المطعم');
        return;
      }
      setData(json);
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء تحميل بيانات لوحة المالك');
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const executeOwnerAction = async (payload: any) => {
    setErrorMsg(null);
    const res = await fetch('/api/admin/owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) {
      setErrorMsg(json.message_ar || json.error || 'تعذر تنفيذ الإجراء');
      return;
    }
    setStatusToast('تم حفظ التغييرات في قاعدة البيانات بنجاح');
    await loadDashboard();
  };

  const handleRealStorageImageUpload = async (productId: string, file: File) => {
    setErrorMsg(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('product_id', productId);

    const res = await fetch('/api/media/upload', {
      method: 'POST',
      body: formData
    });
    const json = await res.json();
    if (!res.ok) {
      setErrorMsg(json.message || json.error || 'فشل رفع الصورة إلى Supabase Storage');
      return;
    }
    setStatusToast(`تم رفع الصورة فعلياً إلى Supabase Storage: ${json.storage_path}`);
    await loadDashboard();
  };

  return (
    <div dir="rtl" className="bh-owner-shell min-h-screen bg-[#0B0A09] p-6 text-[#F5EFE6] space-y-6">
      <header className="border-b border-white/10 pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><img src="/brand-mark.svg" alt="" className="h-12 w-12"/><div><h1 className="text-2xl font-extrabold text-[#D49A3A]">مركز إدارة برجر هاوس</h1><p className="mt-1 text-[10px] tracking-[.16em] text-[#9E9488]">BURGER HOUSE · OWNER CONTROL</p></div></div>
          <p className="mt-1 text-xs text-[#C4C4CC]">مركز التحكم بالمنتجات والأقسام والإضافات والإعلانات وبيانات المتجر.</p>
          <a href="/?admin=1" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#F5B800] px-5 py-3 text-sm font-black text-[#09090B] shadow-lg shadow-black/20">فتح المنيو الأصلي بوضع الإدارة ←</a>
        </div>
      </header>
      <PromoManager />
      <OwnerAnalyticsPanel />

      {data && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#171512] p-4"><div className="text-[11px] text-[#9E9488]">الفروع</div><div className="mt-2 text-2xl font-black text-white">{data.branches?.length || 0}</div></div>
        <div className="rounded-xl border border-white/10 bg-[#171512] p-4"><div className="text-[11px] text-[#9E9488]">الفروع المستقبلة للطلبات</div><div className="mt-2 text-2xl font-black text-emerald-300">{data.branches?.filter((b:any)=>b.is_active&&b.is_accepting_orders).length || 0}</div></div>
        <div className="rounded-xl border border-white/10 bg-[#171512] p-4"><div className="text-[11px] text-[#9E9488]">المنتجات</div><div className="mt-2 text-2xl font-black text-white">{data.products?.length || 0}</div></div>
        <div className="rounded-xl border border-white/10 bg-[#171512] p-4"><div className="text-[11px] text-[#9E9488]">وسائل الدفع المفعلة</div><div className="mt-2 text-2xl font-black text-white">{data.payment_methods?.filter((p:any)=>p.is_enabled).length || 0}</div></div>
      </div>}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-xs font-bold text-red-300">
          {errorMsg}
        </div>
      )}
      {statusToast && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs font-bold text-emerald-300">
          {statusToast}
        </div>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Branches Management */}
          <div className="rounded-2xl border border-white/10 bg-[#141210] p-5 space-y-3">
            <h2 className="text-base font-extrabold text-[#D49A3A]">إدارة الفروع وحالة استقبال الطلبات</h2>
            {(data.branches || []).map((b: any) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0B0A09] p-3 text-xs">
                <div>
                  <div className="font-bold">{b.name_ar}</div>
                  <div className="text-[#9E9488]">{b.phone} • {b.open_time} - {b.close_time}</div>
                </div>
                <button
                  onClick={() =>
                    executeOwnerAction({
                      action: 'UPSERT_BRANCH',
                      branch: { ...b, is_accepting_orders: !b.is_accepting_orders }
                    })
                  }
                  className={`rounded-lg px-3 py-1.5 font-bold ${b.is_accepting_orders ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}
                >
                  {b.is_accepting_orders ? 'مفتوح للطلبات' : 'متوقف'}
                </button>
              </div>
            ))}
          </div>

          {/* Payment Methods Management */}
          <div className="rounded-2xl border border-white/10 bg-[#141210] p-5 space-y-3">
            <h2 className="text-base font-extrabold text-[#D49A3A]">إدارة وسائل الدفع (منع تفعيل بوابات غير مربوطة)</h2>
            {(data.payment_methods || []).map((pm: any) => (
              <div key={pm.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0B0A09] p-3 text-xs">
                <div>
                  <div className="font-bold">{pm.name_ar}</div>
                  {pm.requires_gateway && !pm.gateway_configured && (
                    <div className="text-[10px] text-amber-400">يتطلب ربط بوابة دفع إلكتروني قبل التفعيل</div>
                  )}
                </div>
                <button
                  onClick={() =>
                    executeOwnerAction({
                      action: 'TOGGLE_PAYMENT_METHOD',
                      payment_method_id: pm.id,
                      is_enabled: !pm.is_enabled
                    })
                  }
                  className={`rounded-lg px-3 py-1.5 font-bold ${pm.is_enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-zinc-300'}`}
                >
                  {pm.is_enabled ? 'مفعل' : 'معطل'}
                </button>
              </div>
            ))}
          </div>

          {/* Products & Real Supabase Storage Image Upload */}
          <div className="rounded-2xl border border-white/10 bg-[#141210] p-5 space-y-3 lg:col-span-2">
            <h2 className="text-base font-extrabold text-[#D49A3A]">إدارة المنتجات والرفع الفعلي للصور إلى Supabase Storage (`menu-media`)</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {(data.products || []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0B0A09] p-3 text-xs">
                  <div className="flex items-center gap-3">
                    <img src={p.image_url} alt={p.name_ar} className="h-12 w-12 rounded-lg object-cover" />
                    <div>
                      <div className="font-bold">{p.name_ar}</div>
                      <div className="text-[#D49A3A]">{p.base_price} ر.س</div>
                    </div>
                  </div>
                  <label className="cursor-pointer rounded-lg border border-[#D49A3A]/40 bg-[#D49A3A]/10 px-3 py-1.5 font-bold text-[#D49A3A]">
                    رفع صورة إلى Storage
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleRealStorageImageUpload(p.id, file);
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
