'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Coupon = {
  id: string;
  code: string;
  description_ar: string;
  discount_value: number;
  minimum_order: number;
  max_discount: number;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  used_count: number;
};

const localDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const money = (value: number) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(value);

export default function BranchCouponManager() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discount, setDiscount] = useState('10');
  const [minimum, setMinimum] = useState('0');
  const [maximum, setMaximum] = useState('30');
  const [startsAt, setStartsAt] = useState(() => localDateTime(new Date()));
  const [endsAt, setEndsAt] = useState(() => localDateTime(new Date(Date.now() + 7 * 86400000)));

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/staff/coupons', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message_ar || 'تعذر تحميل الكوبونات.');
      setCoupons(result.coupons || []);
    } catch (e: any) {
      setError(e.message || 'تعذر تحميل الكوبونات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCoupons(); }, [loadCoupons]);

  const createCoupon = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/staff/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          description_ar: description,
          discount_value: Number(discount),
          minimum_order: Number(minimum),
          max_discount: Number(maximum),
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString()
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message_ar || 'تعذر إنشاء الكوبون.');
      setCoupons((current) => [result.coupon, ...current]);
      setCode('');
      setDescription('');
      setMessage('تم إنشاء كود الخصم وربطه بفرعك.');
    } catch (e: any) {
      setError(e.message || 'تعذر إنشاء الكوبون.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCoupon = async (coupon: Coupon) => {
    setError('');
    try {
      const response = await fetch(`/api/staff/coupons/${encodeURIComponent(coupon.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !coupon.is_active })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message_ar || 'تعذر تحديث الكوبون.');
      setCoupons((current) => current.map((item) => item.id === coupon.id ? { ...item, is_active: result.coupon.is_active } : item));
    } catch (e: any) {
      setError(e.message || 'تعذر تحديث الكوبون.');
    }
  };

  return (
    <section className="rounded-2xl border border-[#e5e1d8] bg-white p-4 sm:p-5" aria-labelledby="branch-coupons-title">
      <div className="mb-4">
        <h3 id="branch-coupons-title" className="text-base font-black text-[#24221d]">كوبونات الخصم</h3>
        <p className="mt-1 text-xs leading-6 text-[#777064]">أنشئ كوبونًا خاصًا بفرعك وحدد شروط استخدامه. لا يتأثر الكود بالأحرف الكبيرة أو الصغيرة.</p>
      </div>
      <form onSubmit={createCoupon} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-[#49443b]">كود الخصم
          <input required minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]{3,32}" value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())} placeholder="WELCOME20" dir="ltr" className="mt-1 w-full rounded-xl border border-[#ded8cd] bg-[#fbfaf7] px-3 py-3 text-sm font-bold tracking-wider text-[#211f1a] outline-none focus:border-[#b88746]"/>
        </label>
        <label className="text-xs font-bold text-[#49443b]">نص الخصم الظاهر للعميل
          <input required maxLength={100} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="خصم خاص لعملائنا" className="mt-1 w-full rounded-xl border border-[#ded8cd] bg-[#fbfaf7] px-3 py-3 text-sm text-[#211f1a] outline-none focus:border-[#b88746]"/>
        </label>
        <label className="text-xs font-bold text-[#49443b]">نسبة الخصم (%)
          <input required type="number" min="0.01" max="100" step="0.01" value={discount} onChange={(e)=>setDiscount(e.target.value)} className="mt-1 w-full rounded-xl border border-[#ded8cd] bg-[#fbfaf7] px-3 py-3 text-sm text-[#211f1a] outline-none focus:border-[#b88746]"/>
        </label>
        <label className="text-xs font-bold text-[#49443b]">الحد الأدنى للطلب (ر.س)
          <input required type="number" min="0" step="0.01" value={minimum} onChange={(e)=>setMinimum(e.target.value)} className="mt-1 w-full rounded-xl border border-[#ded8cd] bg-[#fbfaf7] px-3 py-3 text-sm text-[#211f1a] outline-none focus:border-[#b88746]"/>
        </label>
        <label className="text-xs font-bold text-[#49443b]">أقصى قيمة للخصم (ر.س)
          <input required type="number" min="0.01" step="0.01" value={maximum} onChange={(e)=>setMaximum(e.target.value)} className="mt-1 w-full rounded-xl border border-[#ded8cd] bg-[#fbfaf7] px-3 py-3 text-sm text-[#211f1a] outline-none focus:border-[#b88746]"/>
        </label>
        <label className="text-xs font-bold text-[#49443b]">بداية الخصم
          <input required type="datetime-local" value={startsAt} onChange={(e)=>setStartsAt(e.target.value)} className="mt-1 w-full rounded-xl border border-[#ded8cd] bg-[#fbfaf7] px-3 py-3 text-sm text-[#211f1a] outline-none focus:border-[#b88746]"/>
        </label>
        <label className="text-xs font-bold text-[#49443b] sm:col-span-2">نهاية الخصم
          <input required type="datetime-local" min={startsAt} value={endsAt} onChange={(e)=>setEndsAt(e.target.value)} className="mt-1 w-full rounded-xl border border-[#ded8cd] bg-[#fbfaf7] px-3 py-3 text-sm text-[#211f1a] outline-none focus:border-[#b88746]"/>
        </label>
        <button disabled={saving} type="submit" className="rounded-xl bg-[#171713] px-4 py-3 text-sm font-black text-[#f5c542] disabled:opacity-50 sm:col-span-2">{saving ? 'جارٍ إنشاء الكوبون...' : 'إضافة كود الخصم'}</button>
      </form>

      {message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{message}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}

      <div className="mt-5 border-t border-[#eeeae2] pt-4">
        <div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-black text-[#29251f]">أكواد فرعك</h4><button type="button" onClick={()=>void loadCoupons()} className="text-xs font-bold text-[#8d6735]">تحديث</button></div>
        {loading ? <p className="py-4 text-center text-xs text-[#777064]">جارٍ تحميل الكوبونات...</p> : coupons.length === 0 ? <p className="py-4 text-center text-xs text-[#777064]">لا توجد كوبونات لهذا الفرع حتى الآن.</p> : (
          <div className="space-y-2">
            {coupons.map((coupon) => <article key={coupon.id} className="flex flex-col gap-3 rounded-xl border border-[#e8e3da] bg-[#fbfaf7] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><b dir="ltr" className="font-mono text-sm tracking-wider text-[#25221c]">{coupon.code}</b><span className={coupon.is_active ? 'rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700' : 'rounded-full bg-stone-200 px-2 py-1 text-[10px] font-bold text-stone-600'}>{coupon.is_active ? 'نشط' : 'متوقف'}</span></div>
                <p className="mt-1 text-xs text-[#6e675b]">{coupon.description_ar} · خصم {money(Number(coupon.discount_value))}% حتى {money(Number(coupon.max_discount))} ر.س</p>
                <p className="mt-1 text-[10px] text-[#898274]">الحد الأدنى {money(Number(coupon.minimum_order))} ر.س · مستخدم {coupon.used_count} مرة · ينتهي {new Date(coupon.ends_at || '').toLocaleString('ar-SA')}</p>
              </div>
              <button type="button" onClick={()=>void toggleCoupon(coupon)} className="shrink-0 rounded-lg border border-[#d7cdbb] px-3 py-2 text-xs font-bold text-[#514733]">{coupon.is_active ? 'إيقاف الكوبون' : 'تفعيل الكوبون'}</button>
            </article>)}
          </div>
        )}
      </div>
    </section>
  );
}
