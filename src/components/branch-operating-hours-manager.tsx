'use client';

import React, { useEffect, useState } from 'react';

type BranchHours = {
  id: string;
  name_ar: string;
  open_time: string;
  close_time: string;
  closed_days: number[];
  is_accepting_orders: boolean;
};

const DAYS = [
  { id: 0, label: 'الأحد' },
  { id: 1, label: 'الإثنين' },
  { id: 2, label: 'الثلاثاء' },
  { id: 3, label: 'الأربعاء' },
  { id: 4, label: 'الخميس' },
  { id: 5, label: 'الجمعة' },
  { id: 6, label: 'السبت' },
];

export default function BranchOperatingHoursManager() {
  const [branch, setBranch] = useState<BranchHours | null>(null);
  const [openTime, setOpenTime] = useState('12:00');
  const [closeTime, setCloseTime] = useState('02:00');
  const [closedDays, setClosedDays] = useState<number[]>([]);
  const [accepting, setAccepting] = useState(true);
  const [acceptingChanged, setAcceptingChanged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/branch/operating-hours', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || 'تعذر تحميل أوقات العمل.');
      const row = result.branch as BranchHours;
      setBranch(row);
      setOpenTime(row.open_time || '12:00');
      setCloseTime(row.close_time || '02:00');
      setClosedDays(Array.isArray(row.closed_days) ? row.closed_days : []);
      setAccepting(Boolean(row.is_accepting_orders));
      setAcceptingChanged(false);
    } catch (error: any) {
      setMessage(error?.message || 'تعذر تحميل أوقات العمل.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/branch/operating-hours', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          open_time: openTime,
          close_time: closeTime,
          closed_days: closedDays,
          ...(acceptingChanged ? { is_accepting_orders: accepting } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || 'تعذر حفظ التغييرات.');
      setBranch(result.branch);
      setAccepting(Boolean(result.branch.is_accepting_orders));
      setAcceptingChanged(false);
      setMessage('تم حفظ إعدادات الفرع بنجاح.');
    } catch (error: any) {
      setMessage(error?.message || 'تعذر حفظ التغييرات.');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    setClosedDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b));
  };

  return (
    <section className="rounded-2xl border border-[#3a3426] bg-[#171713] p-4 text-[#f6f1e5] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[.16em] text-[#F2B705]">BRANCH OPERATIONS</p>
          <h2 className="mt-1 text-base font-black">أوقات العمل واستقبال الطلبات</h2>
          <p className="mt-1 text-[11px] text-[#aaa391]">{branch?.name_ar || 'إعدادات الفرع'}</p>
        </div>
        <span className={accepting ? 'rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold text-emerald-300' : 'rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold text-red-300'}>
          {accepting ? 'استقبال الطلبات مفعّل' : 'استقبال الطلبات متوقف'}
        </span>
      </div>

      {loading ? <p className="mt-5 text-xs text-[#b8b1a1]">جارٍ تحميل إعدادات الفرع...</p> : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-xs font-bold !text-[#F3F0E8]">
              وقت فتح الفرع
              <input type="time" value={openTime} onChange={(event) => setOpenTime(event.target.value)} className="w-full rounded-xl border border-[#77766f] bg-[#24231d] px-3 py-3 text-sm !text-white outline-none focus:border-[#F2B705]" style={{ colorScheme: 'dark', color: '#FFFFFF', backgroundColor: '#24231d' }} />
            </label>
            <label className="space-y-2 text-xs font-bold text-[#d8cfbb]">
              وقت إغلاق الفرع
              <input type="time" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} className="w-full rounded-xl border border-[#77766f] bg-[#24231d] px-3 py-3 text-sm !text-white outline-none focus:border-[#F2B705]" style={{ colorScheme: 'dark', color: '#FFFFFF', backgroundColor: '#24231d' }} />
            </label>
          </div>

          <div className="mt-5">
            <p className="mb-3 text-xs font-bold !text-[#F3F0E8]">أيام الإغلاق الأسبوعية</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DAYS.map((day) => {
                const checked = closedDays.includes(day.id);
                return <label key={day.id} className={checked ? 'flex cursor-pointer items-center gap-2 rounded-xl border border-[#F2B705] bg-[#3a2e0c] px-3 py-3 text-xs font-bold !text-[#FFD95A]' : 'flex cursor-pointer items-center gap-2 rounded-xl border border-[#77766f] bg-[#24231d] px-3 py-3 text-xs font-bold !text-[#F3F0E8]'}>
                  <input type="checkbox" checked={checked} onChange={() => toggleDay(day.id)} className="h-5 w-5 accent-[#F2B705]" />
                  {day.label}
                </label>;
              })}
            </div>
          </div>

          <label className="mt-5 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#24231d] p-4">
            <span><span className="block text-xs font-black">استقبال الطلبات</span><span className="mt-1 block text-[10px] text-[#aaa391]">يمكن إيقاف الطلبات مؤقتًا دون تغيير أوقات العمل.</span></span>
            <input type="checkbox" checked={accepting} onChange={(event) => { setAccepting(event.target.checked); setAcceptingChanged(true); }} className="h-5 w-5 accent-[#F2B705]" />
          </label>

          <p className="mt-3 text-[11px] leading-6 text-[#D0CBBE]">تنطبق أوقات الفتح والإغلاق على جميع أيام العمل، مع استثناء الأيام المحددة كإجازة. إذا كان وقت الإغلاق بعد منتصف الليل، اختر الوقت الفعلي مثل 02:00.</p>
          {message && <p role="status" className="mt-3 rounded-lg border border-[#8B7438] bg-[#292313] p-3 text-xs font-bold !text-[#FFE6A0]">{message}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-[#F2B705] px-5 py-3 text-xs font-black text-[#17140b] disabled:opacity-50">{saving ? 'جارٍ الحفظ...' : 'حفظ إعدادات الفرع'}</button>
            <button type="button" onClick={() => void load()} disabled={saving} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-[#e5dcc8] disabled:opacity-50">إعادة تحميل</button>
          </div>
        </>
      )}
    </section>
  );
}
