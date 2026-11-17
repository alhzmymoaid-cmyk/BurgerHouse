'use client';

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
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center bg-[#0B0A09] p-6 text-center text-[#F5EFE6]">
        <div className="max-w-md rounded-2xl border border-red-500/40 bg-red-950/20 p-8 space-y-3">
          <h1 className="text-xl font-extrabold text-red-400">403 — محظور الوصول (SOVEREIGN PRIVILEGE REQUIRED)</h1>
          <p className="text-xs text-[#9E9488]">{accessDenied}</p>
          <p className="text-xs text-[#9E9488]">
            يتم التحقق من هوية `super_admin` حصرياً من جلسة Supabase على الخادم ولا يقبل النظام أي صلاحية مرسلة من المتصفح.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#0B0A09] p-6 text-[#F5EFE6] space-y-6">
      <header className="border-b border-white/10 pb-4">
        <h1 className="text-2xl font-extrabold text-[#D49A3A]">لوحة الإدارة العليا السيادية (Sovereign Super Admin Vault)</h1>
        <p className="mt-1 text-xs text-[#9E9488]">
          تحكم كامل بتشغيل الموقع، وضع الصيانة، حساب مالك المطعم، جدار الحماية، والنسخ الاحتياطية الفورية
        </p>
      </header>

      {vaultData && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#141210] p-5 space-y-4">
            <h2 className="text-base font-extrabold text-amber-300">١. التحكم السيادي بتشغيل الموقع ووضع الصيانة</h2>
            <div className="flex items-center justify-between rounded-xl bg-[#0B0A09] p-4 text-xs">
              <span>حالة الموقع العام (Master Site Switch)</span>
              <button
                onClick={() =>
                  executeSovereignAction({
                    action: 'SET_SYSTEM_AVAILABILITY',
                    site_online: !vaultData.settings?.site_online,
                    maintenance_mode: vaultData.settings?.maintenance_mode
                  })
                }
                className="rounded-lg bg-[#D49A3A] px-3 py-1.5 font-black text-[#0B0A09]"
              >
                {vaultData.settings?.site_online ? 'الموقع يعمل (إيقاف؟)' : 'متوقف (تشغيل؟)'}
              </button>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#0B0A09] p-4 text-xs">
              <span>وضع الصيانة الشامل (Maintenance Mode)</span>
              <button
                onClick={() =>
                  executeSovereignAction({
                    action: 'SET_SYSTEM_AVAILABILITY',
                    site_online: vaultData.settings?.site_online,
                    maintenance_mode: !vaultData.settings?.maintenance_mode
                  })
                }
                className="rounded-lg border border-amber-500/40 px-3 py-1.5 font-bold text-amber-300"
              >
                {vaultData.settings?.maintenance_mode ? 'مفعل (إنهاء؟)' : 'معطل (تفعيل؟)'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#141210] p-5 space-y-4">
            <h2 className="text-base font-extrabold text-amber-300">٢. جدار الحماية المشترك وحظر الأرقام / الجلسات / IP</h2>
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
                className="rounded-lg border border-white/15 bg-[#0B0A09] px-2 py-1.5"
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
                className="flex-1 rounded-lg border border-white/15 bg-[#0B0A09] px-3 py-1.5"
              />
              <input
                type="text"
                required
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="السبب"
                className="flex-1 rounded-lg border border-white/15 bg-[#0B0A09] px-3 py-1.5"
              />
              <button type="submit" className="rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white">حظر</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
