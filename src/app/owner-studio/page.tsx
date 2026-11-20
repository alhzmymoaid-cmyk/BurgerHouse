'use client';

import PromoManager from '@/components/promo-manager';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Building2, CreditCard, History, LayoutDashboard, Package, RefreshCw, Search, ShoppingBag, Users } from 'lucide-react';

type Section = 'overview' | 'orders' | 'branches' | 'menu' | 'team' | 'promotions' | 'audit';
const sections: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
  { id: 'orders', label: 'الطلبات', icon: ShoppingBag },
  { id: 'branches', label: 'الفروع والدفع', icon: Building2 },
  { id: 'menu', label: 'المنيو والمنتجات', icon: Package },
  { id: 'team', label: 'فريق العمل', icon: Users },
  { id: 'promotions', label: 'العروض', icon: Activity },
  { id: 'audit', label: 'سجل العمليات', icon: History },
];
const statusLabels: Record<string, string> = {
  new: 'جديد', pending_confirmation: 'بانتظار التأكيد', accepted: 'مقبول',
  preparing: 'قيد التجهيز', ready_for_pickup: 'جاهز للاستلام', completed: 'مكتمل',
  rejected: 'مرفوض', cancelled: 'ملغي',
};
const roleLabels: Record<string, string> = {
  owner: 'مالك المطعم', super_admin: 'مدير النظام', branch_manager: 'مدير فرع',
  cashier: 'كاشير', kitchen_staff: 'موظف مطبخ',
};
const money = (value: number) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(value);

export default function OwnerStudioDashboard() {
  const [data, setData] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [orderSearch, setOrderSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [busyAction, setBusyAction] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [staffRole, setStaffRole] = useState<'branch_manager' | 'cashier' | 'kitchen_staff'>('cashier');
  const [staffBranch, setStaffBranch] = useState('');
  const [staffActive, setStaffActive] = useState(true);
  const [productDrafts, setProductDrafts] = useState<Record<string, { base_price: string; is_active: boolean; is_featured: boolean }>>({});

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/owner', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.message_ar || json.error || 'غير مصرح بالدخول للوحة مالك المطعم');
        setData(null);
        return;
      }
      setData(json);
      setProductDrafts(Object.fromEntries((json.products || []).map((product: any) => [product.id, {
        base_price: String(product.base_price ?? 0),
        is_active: Boolean(product.is_active),
        is_featured: Boolean(product.is_featured)
      }])));
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء تحميل بيانات لوحة المالك');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const executeOwnerAction = async (payload: any) => {
    setBusyAction(true);
    setErrorMsg(null);
    setStatusToast(null);
    try {
      const res = await fetch('/api/admin/owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message_ar || json.error || 'تعذر تنفيذ الإجراء');
      setStatusToast('تم حفظ التغيير بنجاح.');
      await loadDashboard();
      return true;
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تنفيذ الإجراء');
      return false;
    } finally {
      setBusyAction(false);
    }
  };

  const handleRealStorageImageUpload = async (productId: string, file: File) => {
    setErrorMsg(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('product_id', productId);
    try {
      const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'فشل رفع الصورة');
      setStatusToast('تم رفع صورة المنتج وتحديثها.');
      await loadDashboard();
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر رفع الصورة');
    }
  };

  const saveProduct = async (product: any) => {
    const draft = productDrafts[product.id] || {
      base_price: String(product.base_price ?? 0),
      is_active: Boolean(product.is_active),
      is_featured: Boolean(product.is_featured)
    };
    const price = Number(draft.base_price);
    if (!Number.isFinite(price) || price < 0) {
      setErrorMsg('أدخل سعرًا صحيحًا يساوي صفرًا أو أكثر.');
      return;
    }
    await executeOwnerAction({
      action: 'UPSERT_PRODUCT',
      product: { id: product.id, base_price: price, is_active: draft.is_active, is_featured: draft.is_featured }
    });
  };

  const orders = data?.orders || [];
  const filteredOrders = useMemo(() => orders.filter((order: any) => {
    const query = orderSearch.trim().toLowerCase();
    const matchesSearch = !query || [
      order.order_number, order.order_code, order.customer_name, order.customer_phone,
    ].some(value => String(value || '').toLowerCase().includes(query));
    const matchesBranch = branchFilter === 'all' || order.branch_id === branchFilter;
    return matchesSearch && matchesBranch;
  }), [orders, orderSearch, branchFilter]);
  const completedOrders = orders.filter((order: any) => order.status === 'completed');
  const completedValue = completedOrders.reduce((sum: number, order: any) => sum + Number(order.total_amount || 0), 0);
  const pendingOrders = orders.filter((order: any) => ['new', 'pending_confirmation'].includes(order.status)).length;
  const preparingOrders = orders.filter((order: any) => order.status === 'preparing').length;
  const branchName = (id: string) => data?.branches?.find((branch: any) => branch.id === id)?.name_ar || '—';
  const selectedStaff = data?.staff?.find((staff: any) => staff.id === selectedStaffId);
  const beginStaffEdit = (staff: any) => {
    setSelectedStaffId(staff.id);
    setStaffRole(staff.role);
    setStaffBranch(staff.assigned_branch_id || '');
    setStaffActive(Boolean(staff.is_active));
    setErrorMsg(null);
    setStatusToast(null);
  };
  const saveStaffEdit = async () => {
    if (!selectedStaff) return;
    const saved = await executeOwnerAction({
      action: 'MANAGE_STAFF_MEMBER',
      staff: {
        id: selectedStaff.id,
        role: staffRole,
        assigned_branch_id: staffBranch || null,
        is_active: staffActive
      }
    });
    if (saved) setSelectedStaffId('');
  };
  const dateLabel = (value: string) => value ? new Date(value).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const panel = 'rounded-xl border border-[#E8E3DA] bg-white p-4 sm:p-5';
  const heading = 'flex flex-wrap items-center justify-between gap-3 border-b border-[#EEE9E1] pb-4';
  const actionButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#E2DCD3] bg-white px-3 py-2 text-xs font-bold text-[#514A43] transition hover:bg-[#F7F5F0] disabled:opacity-50';

  return (
    <main dir="rtl" className="bh-owner-shell min-h-screen space-y-5 p-4 text-[#292522] sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E3DDD4] pb-5">
        <div className="flex items-center gap-3">
          <img src="/brand-mark.svg" alt="" className="h-12 w-12" />
          <div>
            <p className="text-[10px] font-black tracking-[.18em] text-[#B92727]">BURGER HOUSE · OWNER CONSOLE</p>
            <h1 className="mt-1 text-2xl font-black">مركز إدارة المطعم</h1>
            <p className="mt-1 text-xs text-[#77716A]">{data?.profile?.full_name || 'لوحة المالك'} · إدارة التشغيل والفروع والموظفين</p>
          </div>
        </div>
        <button type="button" onClick={loadDashboard} disabled={loading} className={actionButton}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> تحديث البيانات
        </button>
      </header>

      <nav aria-label="أقسام الإدارة" className="flex gap-2 overflow-x-auto border-b border-[#E6E0D7] pb-3">
        {sections.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setActiveSection(id)} aria-current={activeSection === id ? 'page' : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${activeSection === id ? 'bg-[#292522] text-white' : 'border border-[#E5DFD6] bg-white text-[#625B53] hover:bg-[#F7F5F0]'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      {errorMsg && <div role="alert" className="rounded-lg border border-[#E9C2BC] bg-[#FFF0EE] p-3 text-sm font-semibold text-[#9A2F27]">{errorMsg}</div>}
      {statusToast && <div role="status" className="rounded-lg border border-[#CBE3D3] bg-[#EDF7F0] p-3 text-sm font-semibold text-[#236A45]">{statusToast}</div>}

      {loading && !data && <div className="rounded-xl border border-[#E8E3DA] bg-white p-8 text-center text-sm text-[#77716A]">جارٍ تحميل بيانات الإدارة...</div>}

      {data && activeSection === 'overview' && (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'الطلبات ضمن السجل المحمّل', value: orders.length, note: 'آخر 200 طلب', color: 'text-[#292522]' },
              { label: 'تحتاج متابعة', value: pendingOrders, note: 'جديدة أو بانتظار التأكيد', color: 'text-[#A56B16]' },
              { label: 'قيد التجهيز', value: preparingOrders, note: 'داخل دورة المطبخ', color: 'text-[#315F88]' },
              { label: 'طلبات مكتملة', value: completedOrders.length, note: 'من السجل المحمّل', color: 'text-[#26734D]' },
              { label: 'قيمة الطلبات المكتملة', value: money(completedValue) + ' ر.س', note: 'ليست تقريراً محاسبياً نهائياً', color: 'text-[#292522]' },
            ].map((item) => (
              <article key={item.label} className={panel}>
                <p className="text-[11px] font-semibold text-[#77716A]">{item.label}</p>
                <p className={`mt-3 text-2xl font-black tabular-nums ${item.color}`}>{item.value}</p>
                <p className="mt-2 text-[10px] text-[#8B837B]">{item.note}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
            <section className={panel}>
              <div className={heading}>
                <div><h2 className="text-base font-black">حركة الطلبات الأخيرة</h2><p className="mt-1 text-xs text-[#77716A]">نظرة سريعة على آخر الطلبات المسجلة</p></div>
                <button type="button" onClick={() => setActiveSection('orders')} className="text-xs font-bold text-[#B92727]">عرض كل الطلبات</button>
              </div>
              <div className="mt-3 divide-y divide-[#F0ECE6]">
                {orders.slice(0, 7).map((order: any) => (
                  <div key={order.id || order.order_code} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div><b className="text-sm">#{order.order_number ?? '—'}</b><p className="mt-1 text-xs text-[#77716A]">{order.customer_name || 'عميل'} · {branchName(order.branch_id)}</p></div>
                    <div className="text-left"><b className="text-sm tabular-nums">{money(Number(order.total_amount || 0))} ر.س</b><p className="mt-1 text-[10px] text-[#77716A]">{statusLabels[order.status] || order.status}</p></div>
                  </div>
                ))}
                {orders.length === 0 && <p className="py-8 text-center text-sm text-[#77716A]">لا توجد طلبات مسجلة.</p>}
              </div>
            </section>
            <section className={panel}>
              <div className={heading}><div><h2 className="text-base font-black">حالة الفروع</h2><p className="mt-1 text-xs text-[#77716A]">جاهزية استقبال الطلبات</p></div><Building2 size={19} className="text-[#B92727]" /></div>
              <div className="mt-3 space-y-3">
                {(data.branches || []).map((branch: any) => (
                  <div key={branch.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#F8F6F2] p-3">
                    <div className="min-w-0"><b className="block truncate text-sm">{branch.name_ar}</b><small className="mt-1 block text-[10px] text-[#77716A]">{branch.open_time} – {branch.close_time}</small></div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${branch.is_active && branch.is_accepting_orders ? 'bg-[#E7F4EB] text-[#236A45]' : 'bg-[#FCEBE9] text-[#A62F28]'}`}>{branch.is_active && branch.is_accepting_orders ? 'يستقبل الطلبات' : 'متوقف'}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}

      {data && activeSection === 'orders' && (
        <section className={panel}>
          <div className={heading}>
            <div><h2 className="text-lg font-black">متابعة الطلبات</h2><p className="mt-1 text-xs text-[#77716A]">السجل الذي توفره الواجهة حالياً: أحدث 200 طلب</p></div>
            <span className="text-xs font-bold text-[#77716A]">{filteredOrders.length} نتيجة</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_230px]">
            <label className="relative"><Search size={16} className="absolute right-3 top-3.5 text-[#8B837B]" /><input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="ابحث برقم الطلب أو اسم العميل أو الجوال" className="h-11 w-full rounded-lg border border-[#DDD7CE] bg-white pr-9 pl-3 text-sm outline-none focus:border-[#B92727]" /></label>
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="h-11 rounded-lg border border-[#DDD7CE] bg-white px-3 text-sm"><option value="all">كل الفروع</option>{(data.branches || []).map((b: any) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}</select>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-right text-xs">
              <thead className="bg-[#F7F5F0] text-[#6D655D]"><tr><th className="p-3">رقم الطلب</th><th className="p-3">العميل</th><th className="p-3">الفرع</th><th className="p-3">الحالة</th><th className="p-3">الإجمالي</th><th className="p-3">التاريخ</th></tr></thead>
              <tbody className="divide-y divide-[#F0ECE6]">
                {filteredOrders.map((order: any) => <tr key={order.id || order.order_code} className="hover:bg-[#FCFBF9]"><td className="p-3 font-black">#{order.order_number ?? '—'}</td><td className="p-3"><b>{order.customer_name || '—'}</b><small className="mt-1 block text-[#77716A]" dir="ltr">{order.customer_phone || ''}</small></td><td className="p-3">{branchName(order.branch_id)}</td><td className="p-3"><span className="rounded-full bg-[#F1EEE8] px-2.5 py-1">{statusLabels[order.status] || order.status}</span></td><td className="p-3 font-bold tabular-nums">{money(Number(order.total_amount || 0))} ر.س</td><td className="p-3 text-[#77716A]">{dateLabel(order.created_at)}</td></tr>)}
              </tbody>
            </table>
            {filteredOrders.length === 0 && <p className="py-10 text-center text-sm text-[#77716A]">لا توجد نتائج مطابقة.</p>}
          </div>
        </section>
      )}

      {data && activeSection === 'branches' && (
        <section className="grid gap-5 xl:grid-cols-2">
          <div className={panel}>
            <div className={heading}><div><h2 className="text-base font-black">الفروع والتشغيل</h2><p className="mt-1 text-xs text-[#77716A]">إيقاف استقبال الطلبات لا يعطّل حسابات الموظفين</p></div><Building2 size={19} className="text-[#B92727]" /></div>
            <div className="mt-3 space-y-3">
              {(data.branches || []).map((b: any) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#EEE9E1] p-3">
                  <div><b className="text-sm">{b.name_ar}</b><p className="mt-1 text-[10px] text-[#77716A]">{b.phone} · {b.open_time} – {b.close_time}</p><p className="mt-1 text-[10px] text-[#77716A]">{b.address_ar}</p></div>
                  <button type="button" disabled={busyAction} onClick={() => executeOwnerAction({ action: 'UPSERT_BRANCH', branch: { ...b, is_accepting_orders: !b.is_accepting_orders } })} className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${b.is_accepting_orders ? 'bg-[#E7F4EB] text-[#236A45]' : 'bg-[#FCEBE9] text-[#A62F28]'}`}>{b.is_accepting_orders ? 'إيقاف استقبال الطلبات' : 'فتح استقبال الطلبات'}</button>
                </div>
              ))}
            </div>
          </div>
          <div className={panel}>
            <div className={heading}><div><h2 className="text-base font-black">وسائل الدفع</h2><p className="mt-1 text-xs text-[#77716A]">لا يمكن تفعيل بوابة إلكترونية قبل إعدادها</p></div><CreditCard size={19} className="text-[#B92727]" /></div>
            <div className="mt-3 space-y-3">
              {(data.payment_methods || []).map((pm: any) => (
                <div key={pm.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#EEE9E1] p-3">
                  <div><b className="text-sm">{pm.name_ar}</b>{pm.requires_gateway && !pm.gateway_configured && <p className="mt-1 text-[10px] text-[#A56B16]">يتطلب ربط بوابة دفع قبل التفعيل</p>}</div>
                  <button type="button" disabled={busyAction || (pm.requires_gateway && !pm.gateway_configured && !pm.is_enabled)} onClick={() => executeOwnerAction({ action: 'TOGGLE_PAYMENT_METHOD', payment_method_id: pm.id, is_enabled: !pm.is_enabled })} className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 ${pm.is_enabled ? 'bg-[#E7F4EB] text-[#236A45]' : 'bg-[#F1EEE8] text-[#625B53]'}`}>{pm.is_enabled ? 'مفعّل' : 'معطّل'}</button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {data && activeSection === 'menu' && (
        <section className={panel}>
          <div className={heading}><div><h2 className="text-lg font-black">المنيو والمنتجات</h2><p className="mt-1 text-xs text-[#77716A]">تحديث صور المنتجات ينعكس على المتجر بعد نجاح الرفع</p></div><Package size={19} className="text-[#B92727]" /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(data.products || []).map((p: any) => {
              const draft = productDrafts[p.id] || { base_price: String(p.base_price ?? 0), is_active: Boolean(p.is_active), is_featured: Boolean(p.is_featured) };
              return (
                <article key={p.id} className="overflow-hidden rounded-lg border border-[#E8E3DA] bg-white">
                  <img src={p.image_url} alt={p.name_ar} className="h-40 w-full bg-[#F1EEE8] object-cover" />
                  <div className="space-y-3 p-3">
                    <div className="flex items-start justify-between gap-2"><b className="text-sm">{p.name_ar}</b><span className="text-[10px] text-[#77716A]">إدارة المنتج</span></div>
                    <label className="grid gap-1 text-xs font-bold text-[#514A43]">السعر (ر.س)<input type="number" min="0" step="0.5" inputMode="decimal" value={draft.base_price} onChange={e => setProductDrafts(current => ({ ...current, [p.id]: { ...draft, base_price: e.target.value } }))} className="h-10 rounded-lg border border-[#DDD7CE] bg-white px-3" /></label>
                    <div className="flex flex-wrap gap-3 text-[11px] text-[#514A43]">
                      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.is_active} onChange={e => setProductDrafts(current => ({ ...current, [p.id]: { ...draft, is_active: e.target.checked } }))} className="accent-[#B92727]" /> ظاهر في المنيو</label>
                      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.is_featured} onChange={e => setProductDrafts(current => ({ ...current, [p.id]: { ...draft, is_featured: e.target.checked } }))} className="accent-[#B92727]" /> منتج مميز</label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busyAction} onClick={() => saveProduct(p)} className="rounded-lg bg-[#B92727] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">حفظ بيانات المنتج</button>
                      <label className="inline-flex cursor-pointer items-center rounded-lg border border-[#E2DCD3] px-3 py-2 text-xs font-bold text-[#514A43] hover:bg-[#F7F5F0]">تغيير الصورة<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => { const file = e.target.files?.[0]; if (file) handleRealStorageImageUpload(p.id, file); e.currentTarget.value = ''; }} /></label>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {data && activeSection === 'team' && (
        <section className={panel}>
          <div className={heading}><div><h2 className="text-lg font-black">فريق العمل والصلاحيات</h2><p className="mt-1 text-xs text-[#77716A]">إدارة الأدوار التشغيلية وتعيين الفروع وحالة دخول الموظفين مع تسجيل كل تغيير</p></div><Users size={19} className="text-[#B92727]" /></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-right text-xs"><thead className="bg-[#F7F5F0] text-[#6D655D]"><tr><th className="p-3">الموظف</th><th className="p-3">البريد الوظيفي</th><th className="p-3">الدور</th><th className="p-3">الفرع المعيّن</th><th className="p-3">الحالة</th><th className="p-3">إجراء</th></tr></thead><tbody className="divide-y divide-[#F0ECE6]">{(data.staff || []).map((staff: any) => <tr key={staff.id}><td className="p-3 font-bold">{staff.full_name || '—'}</td><td className="p-3" dir="ltr">{staff.email || '—'}</td><td className="p-3">{roleLabels[staff.role] || staff.role}</td><td className="p-3">{branchName(staff.assigned_branch_id)}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 ${staff.is_active ? 'bg-[#E7F4EB] text-[#236A45]' : 'bg-[#FCEBE9] text-[#A62F28]'}`}>{staff.is_active ? 'نشط' : 'موقوف'}</span></td><td className="p-3">{['branch_manager','cashier','kitchen_staff'].includes(staff.role) ? <button type="button" onClick={() => beginStaffEdit(staff)} className="rounded-lg border border-[#E2DCD3] px-3 py-2 font-bold text-[#514A43] hover:bg-[#F7F5F0]">تعديل</button> : <span className="text-[10px] text-[#8B837B]">حساب محمي</span>}</td></tr>)}</tbody></table></div>
          {selectedStaff && (
            <div className="mt-5 rounded-xl border border-[#E8E3DA] bg-[#FAF9F6] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black">تعديل بيانات الموظف</h3><p className="mt-1 text-xs text-[#77716A]">{selectedStaff.full_name} · {selectedStaff.email}</p></div><button type="button" onClick={() => setSelectedStaffId('')} className="text-xs font-bold text-[#77716A]">إغلاق</button></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-bold text-[#514A43]">الدور الوظيفي<select value={staffRole} onChange={e => setStaffRole(e.target.value as any)} className="h-11 rounded-lg border border-[#DDD7CE] bg-white px-3"><option value="branch_manager">مدير فرع</option><option value="cashier">كاشير</option><option value="kitchen_staff">موظف مطبخ</option></select></label>
                <label className="grid gap-1 text-xs font-bold text-[#514A43]">الفرع المعيّن<select value={staffBranch} onChange={e => setStaffBranch(e.target.value)} className="h-11 rounded-lg border border-[#DDD7CE] bg-white px-3"><option value="">بدون فرع معيّن</option>{(data.branches || []).map((branch: any) => <option key={branch.id} value={branch.id}>{branch.name_ar}</option>)}</select></label>
              </div>
              <label className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#514A43]"><input type="checkbox" checked={staffActive} onChange={e => setStaffActive(e.target.checked)} className="h-4 w-4 accent-[#B92727]" /> الحساب نشط ويسمح له بتسجيل الدخول</label>
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busyAction} onClick={saveStaffEdit} className="rounded-lg bg-[#B92727] px-5 py-3 text-xs font-black text-white disabled:opacity-50">{busyAction ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}</button><button type="button" onClick={() => setSelectedStaffId('')} className="rounded-lg border border-[#DDD7CE] bg-white px-4 py-3 text-xs font-bold text-[#514A43]">إلغاء</button></div>
              <p className="mt-3 text-[10px] leading-5 text-[#77716A]">هذا الإجراء يحدّث الدور والفرع وحالة الحساب فقط، ويسجل التغيير في سجل التدقيق. لا يغيّر البريد أو كلمة المرور ولا ينشئ حساب دخول جديدًا.</p>
            </div>
          )}
        </section>
      )}

      {data && activeSection === 'promotions' && <section className={panel}><div className={heading}><div><h2 className="text-lg font-black">إدارة العروض</h2><p className="mt-1 text-xs text-[#77716A]">إدارة صور العروض وجدولتها والفروع المستهدفة</p></div><Activity size={19} className="text-[#B92727]" /></div><div className="mt-4"><PromoManager /></div></section>}

      {data && activeSection === 'audit' && (
        <section className={panel}>
          <div className={heading}><div><h2 className="text-lg font-black">سجل العمليات الإدارية</h2><p className="mt-1 text-xs text-[#77716A]">آخر 100 سجل تدقيق متاح من الخادم</p></div><History size={19} className="text-[#B92727]" /></div>
          <div className="mt-4 divide-y divide-[#F0ECE6]">
            {(data.audit_logs || []).map((log: any) => <article key={log.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><b className="text-sm">{log.action || 'عملية إدارية'}</b><p className="mt-1 text-xs text-[#77716A]">{log.actor_name || 'النظام'} · {roleLabels[log.actor_role] || log.actor_role || '—'} · {log.target_type || '—'}</p></div><time className="text-[10px] text-[#77716A]">{dateLabel(log.created_at)}</time></article>)}
            {(data.audit_logs || []).length === 0 && <p className="py-8 text-center text-sm text-[#77716A]">لا توجد سجلات تدقيق.</p>}
          </div>
        </section>
      )}

      <footer className="border-t border-[#E3DDD4] pt-4 text-[10px] leading-6 text-[#81786F]">لوحة المالك تعرض بيانات تشغيلية من قاعدة البيانات. الأرقام المالية المعروضة هنا مبنية على آخر 200 طلب محمّل وليست بديلاً عن تقرير محاسبي شامل.</footer>
    </main>
  );
}
