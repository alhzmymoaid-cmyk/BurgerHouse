'use client';

import PromoManager from '@/components/promo-manager';

import React, { useState, useEffect, useCallback } from 'react';

export default function SovereignSuperAdminVaultPage() {
  const [vaultData, setVaultData] = useState<any | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<'phone' | 'ip' | 'session'>('phone');
  const [entityValue, setEntityValue] = useState('');
  const [blockReason, setBlockReason] = useState('');

  const loadSovereignData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sovereign', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setAccessDenied(json.message || json.error || '403 SOVEREIGN_PRIVILEGE_REQUIRED');
        return;
      }
      setAccessDenied(null);
      setVaultData(json);
    } catch (err: any) {
      setAccessDenied(err?.message || 'تعذر التحقق من جلسة المدير الأعلى');
    }
  }, []);

  useEffect(() => {
    loadSovereignData();
  }, [loadSovereignData]);

  const executeSovereignAction = async (payload: any) => {
    const res = await fetch('/api/admin/sovereign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) {
      setAccessDenied(json.message || json.error);
      return;
    }
    await loadSovereignData();
  };

  if (accessDenied) {
    return (
      <div dir="rtl" className="bh-superadmin flex min-h-screen flex-col items-center justify-center bg-[#f4f1eb] p-6 text-center text-[#201e1a]">
        <div className="max-w-md rounded-sm border border-red-200 bg-red-50 p-8 space-y-3">
          <h1 className="text-xl font-extrabold text-red-700">403 — محظور الوصول (SOVEREIGN PRIVILEGE REQUIRED)</h1>
          <p className="text-xs text-[#777064]">{accessDenied}</p>
          <p className="text-xs text-[#777064]">
            يتم التحقق من هوية `super_admin` حصرياً من جلسة Supabase على الخادم ولا يقبل النظام أي صلاحية مرسلة من المتصفح.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="bh-superadmin min-h-screen bg-[#f4f1eb] p-6 text-[#201e1a] space-y-6">
      <header className="border-b border-[#ded8cd] pb-4">
        <div className="flex items-center gap-3"><img src="/brand-mark.svg" alt="" className="h-12 w-12"/><div><h1 className="text-2xl font-extrabold text-[#a65e36]">مركز الإدارة العامة</h1><p className="mt-1 text-[10px] tracking-[.16em] text-[#81776b]">BURGER HOUSE · SYSTEM ADMINISTRATION</p></div></div>
        <p className="mt-1 text-xs text-[#777064]">
          إدارة تشغيل المطعم، حالة الموقع، وضع الصيانة، وحماية الطلبات
        </p>
      </header>
      <PromoManager />


      {vaultData && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-sm border border-[#ded8cd] bg-[#fbfaf7] p-5 space-y-4">
            <h2 className="text-base font-extrabold text-[#a65e36]">١. التحكم السيادي بتشغيل الموقع ووضع الصيانة</h2>
            <div className="flex items-center justify-between rounded-xl bg-[#f4f1eb] p-4 text-xs">
              <span>حالة الموقع</span>
              <button
                onClick={() =>
                  executeSovereignAction({
                    action: 'SET_SYSTEM_AVAILABILITY',
                    site_online: !vaultData.settings?.site_online,
                    maintenance_mode: vaultData.settings?.maintenance_mode
                  })
                }
                className="rounded-lg bg-[#a65e36] px-3 py-1.5 font-black text-white"
              >
                {vaultData.settings?.site_online ? 'الموقع يعمل (إيقاف؟)' : 'متوقف (تشغيل؟)'}
              </button>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#f4f1eb] p-4 text-xs">
              <span>وضع الصيانة</span>
              <button
                onClick={() =>
                  executeSovereignAction({
                    action: 'SET_SYSTEM_AVAILABILITY',
                    site_online: vaultData.settings?.site_online,
                    maintenance_mode: !vaultData.settings?.maintenance_mode
                  })
                }
                className="rounded-lg border border-[#c9b9a4] px-3 py-1.5 font-bold text-[#a65e36]"
              >
                {vaultData.settings?.maintenance_mode ? 'مفعل (إنهاء؟)' : 'معطل (تفعيل؟)'}
              </button>
            </div>
          </div>

          <div className="rounded-sm border border-[#ded8cd] bg-[#fbfaf7] p-5 space-y-4">
            <h2 className="text-base font-extrabold text-[#a65e36]">٢. جدار الحماية المشترك وحظر الأرقام / الجلسات / IP</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeSovereignAction({
                  action: 'BLOCK_ENTITY',
                  entity_type: entityType,
                  entity_value: entityValue,
                  reason: blockReason
                });
                setEntityValue('');
                setBlockReason('');
              }}
              className="flex flex-wrap gap-2 text-xs"
            >
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as any)}
                className="rounded-lg border border-[#d8d0c4] bg-[#f4f1eb] px-2 py-1.5"
              >
                <option value="phone">رقم جوال</option>
                <option value="ip">عنوان IP</option>
                <option value="session">معرف جلسة</option>
              </select>
              <input
                type="text"
                required
                value={entityValue}
                onChange={(e) => setEntityValue(e.target.value)}
                placeholder="+966548192736"
                className="flex-1 rounded-lg border border-[#d8d0c4] bg-[#f4f1eb] px-3 py-1.5"
              />
              <input
                type="text"
                required
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="السبب"
                className="flex-1 rounded-lg border border-[#d8d0c4] bg-[#f4f1eb] px-3 py-1.5"
              />
              <button type="submit" className="rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white">حظر</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
