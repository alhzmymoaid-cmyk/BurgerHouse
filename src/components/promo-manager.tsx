'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Banner = { id:string; branch_id:string|null; title_ar:string; subtitle_ar?:string|null; image_url:string; badge_text?:string|null; cta_label?:string|null; target_url?:string|null; starts_at?:string; ends_at?:string|null; sort_order?:number; is_active:boolean };
type Branch = { id:string; name_ar:string };
const blank = { id:'', branch_id:'', title_ar:'', subtitle_ar:'', image_url:'', badge_text:'عرض اليوم', cta_label:'اطلب الآن', target_url:'#menu-section', starts_at:'', ends_at:'', sort_order:'0', is_active:true };

export default function PromoManager() {
  const [rows,setRows] = useState<Banner[]>([]);
  const [branches,setBranches] = useState<Branch[]>([]);
  const [role,setRole] = useState('');
  const [form,setForm] = useState(blank);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');

  const load = useCallback(async () => {
    const [bannersRes,catalogRes] = await Promise.all([
      fetch('/api/promo-banners',{cache:'no-store'}),
      fetch('/api/catalog',{cache:'no-store'})
    ]);
    const banners = await bannersRes.json();
    const catalog = await catalogRes.json();
    if (!bannersRes.ok) { setError(banners.error || 'تعذر تحميل العروض'); return; }
    setRows(banners.promo_banners || []);
    setRole(banners.profile?.role || '');
    setBranches(catalog.branches || []);
  },[]);
  useEffect(()=>{ load().catch(()=>setError('تعذر الاتصال بخدمة العروض')); },[load]);

  const update = (key:string,value:any) => setForm(current=>({...current,[key]:value}));
  const edit = (row:Banner) => setForm({
    id:row.id, branch_id:row.branch_id || '', title_ar:row.title_ar, subtitle_ar:row.subtitle_ar || '',
    image_url:row.image_url, badge_text:row.badge_text || 'عرض اليوم', cta_label:row.cta_label || 'اطلب الآن',
    target_url:row.target_url || '#menu-section', starts_at:row.starts_at ? new Date(row.starts_at).toISOString().slice(0,16) : '',
    ends_at:row.ends_at ? new Date(row.ends_at).toISOString().slice(0,16) : '', sort_order:String(row.sort_order ?? 0), is_active:row.is_active
  });
  const save = async (event:FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const body:any = {
        title_ar:form.title_ar, subtitle_ar:form.subtitle_ar || null, image_url:form.image_url,
        badge_text:form.badge_text, cta_label:form.cta_label, target_url:form.target_url || '#menu-section',
        starts_at:form.starts_at ? new Date(form.starts_at).toISOString() : new Date().toISOString(),
        ends_at:form.ends_at ? new Date(form.ends_at).toISOString() : null,
        sort_order:Number(form.sort_order), is_active:form.is_active
      };
      if (role !== 'branch_manager') body.branch_id = form.branch_id || null;
      if (form.id) body.id = form.id;
      const response = await fetch('/api/promo-banners',{method:form.id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'تعذر حفظ العرض');
      setForm(blank); setMessage('تم حفظ العرض بنجاح'); await load();
    } catch(e:any) { setError(e.message || 'حدث خطأ أثناء الحفظ'); }
    finally { setBusy(false); }
  };
  const remove = async (id:string) => {
    if (!window.confirm('هل تريد حذف هذا العرض نهائيًا؟')) return;
    const response=await fetch('/api/promo-banners?id='+encodeURIComponent(id),{method:'DELETE'});
    const result=await response.json();
    if(!response.ok){setError(result.error||'تعذر حذف العرض');return;}
    setMessage('تم حذف العرض'); await load();
  };
  const toggle = async (row:Banner) => {
    const response=await fetch('/api/promo-banners',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id,is_active:!row.is_active})});
    const result=await response.json();
    if(!response.ok){setError(result.error||'تعذر تحديث حالة العرض');return;}
    await load();
  };
  if (!['super_admin','owner','branch_manager'].includes(role)) return null;

  const field='w-full rounded-xl border border-white/10 bg-[#09090B] px-3 py-3 text-xs text-white outline-none focus:border-[#F5B800]';
  return <section dir="rtl" className="rounded-2xl border border-white/10 bg-[#131317] p-4 sm:p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-base font-black text-[#F5B800]">لوحة العروض القابلة للتقليب</h2><p className="mt-1 text-[11px] text-[#A1A1AA]">تُعرض العروض النشطة تلقائيًا لعملاء الفرع المحدد</p></div>
      <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-[#A1A1AA]">{role==='branch_manager'?'إدارة عروض فرعك':'إدارة جميع العروض'}</span>
    </div>
    {(error||message)&&<p className={error?'text-xs text-red-300':'text-xs text-emerald-300'}>{error||message}</p>}
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input className={field} placeholder="عنوان العرض *" required value={form.title_ar} onChange={e=>update('title_ar',e.target.value)}/>
      <input className={field} placeholder="نص مختصر" value={form.subtitle_ar} onChange={e=>update('subtitle_ar',e.target.value)}/>
      <input className={field} placeholder="رابط صورة العرض *" type="url" required value={form.image_url} onChange={e=>update('image_url',e.target.value)}/>
      <input className={field} placeholder="الشارة: عرض اليوم / جديد" value={form.badge_text} onChange={e=>update('badge_text',e.target.value)}/>
      <input className={field} placeholder="نص الزر" value={form.cta_label} onChange={e=>update('cta_label',e.target.value)}/>
      <input className={field} placeholder="رابط الوجهة أو #menu-section" value={form.target_url} onChange={e=>update('target_url',e.target.value)}/>
      {role!=='branch_manager'&&<select className={field} value={form.branch_id} onChange={e=>update('branch_id',e.target.value)}><option value="">جميع الفروع</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name_ar}</option>)}</select>}
      <label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-[#A1A1AA]">بداية العرض<input className="min-w-0 flex-1 bg-transparent text-white" type="datetime-local" value={form.starts_at} onChange={e=>update('starts_at',e.target.value)}/></label>
      <label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-[#A1A1AA]">نهاية العرض<input className="min-w-0 flex-1 bg-transparent text-white" type="datetime-local" value={form.ends_at} onChange={e=>update('ends_at',e.target.value)}/></label>
      <input className={field} type="number" placeholder="ترتيب العرض" value={form.sort_order} onChange={e=>update('sort_order',e.target.value)}/>
      <label className="flex items-center gap-2 text-xs text-[#A1A1AA]"><input type="checkbox" checked={form.is_active} onChange={e=>update('is_active',e.target.checked)}/> العرض نشط</label>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <button disabled={busy} className="min-h-11 rounded-xl bg-[#F5B800] px-5 text-xs font-black text-[#09090B] disabled:opacity-50">{busy?'جارٍ الحفظ…':form.id?'حفظ التعديلات':'إضافة العرض'}</button>
        {form.id&&<button type="button" onClick={()=>setForm(blank)} className="min-h-11 rounded-xl border border-white/15 px-4 text-xs font-bold text-white">إلغاء التعديل</button>}
      </div>
    </form>
    <div className="grid gap-2">
      {rows.map(row=><div key={row.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#09090B] p-3">
        <img src={row.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" onError={e=>{e.currentTarget.style.opacity='0.25'}}/>
        <div className="min-w-0 flex-1"><b className="block truncate text-xs text-white">{row.title_ar}</b><span className="text-[10px] text-[#A1A1AA]">{row.branch_id?branches.find(b=>b.id===row.branch_id)?.name_ar||'فرع محدد':'جميع الفروع'} · {row.is_active?'نشط':'متوقف'}</span></div>
        <button type="button" onClick={()=>toggle(row)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-[#F5B800]">{row.is_active?'إيقاف':'تفعيل'}</button>
        <button type="button" onClick={()=>edit(row)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-white">تعديل</button>
        <button type="button" onClick={()=>remove(row.id)} className="rounded-lg border border-red-500/30 px-3 py-2 text-[10px] text-red-300">حذف</button>
      </div>)}
      {!rows.length&&<p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-[#A1A1AA]">لا توجد عروض بعد. أضف أول عرض من النموذج أعلاه.</p>}
    </div>
  </section>;
}
