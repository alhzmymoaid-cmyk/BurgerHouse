'use client';

import { useCallback, useEffect, useState } from 'react';

type Banner = { id:string; branch_id:string|null; title_ar:string; image_url:string; sort_order?:number; is_active:boolean };
type Branch = { id:string; name_ar:string };

export default function PromoManager() {
  const [rows,setRows] = useState<Banner[]>([]);
  const [branches,setBranches] = useState<Branch[]>([]);
  const [role,setRole] = useState('');
  const [branchId,setBranchId] = useState('');
  const [imageUrl,setImageUrl] = useState('');
  const [editingId,setEditingId] = useState('');
  const [busy,setBusy] = useState(false);
  const [uploading,setUploading] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');

  const load = useCallback(async () => {
    const [bannersRes,catalogRes] = await Promise.all([
      fetch('/api/promo-banners',{cache:'no-store'}),
      fetch('/api/catalog',{cache:'no-store'})
    ]);
    const banners = await bannersRes.json();
    const catalog = await catalogRes.json();
    if (!bannersRes.ok) { setError(banners.error || 'تعذر تحميل الإعلانات'); return; }
    setRows(banners.promo_banners || []);
    setRole(banners.profile?.role || '');
    setBranches(catalog.branches || []);
    if (banners.profile?.role === 'branch_manager') setBranchId(banners.profile.assigned_branch_id || '');
  },[]);
  useEffect(()=>{ load().catch(()=>setError('تعذر الاتصال بخدمة الإعلانات')); },[load]);

  const uploadImage = async (file:File) => {
    setUploading(true); setError(''); setMessage('');
    try {
      if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) throw new Error('اختر صورة بصيغة JPG أو PNG أو WebP أو AVIF.');
      if (file.size > 5 * 1024 * 1024) throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميجابايت.');
      const data=new FormData(); data.append('file',file);
      const response=await fetch('/api/promo-banners/upload',{method:'POST',body:data});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||'فشل رفع الصورة');
      setImageUrl(result.image_url);
      setMessage('تم رفع الصورة. راجع المعاينة ثم احفظ الإعلان.');
    } catch(e:any) { setError(e.message||'تعذر رفع الصورة'); }
    finally { setUploading(false); }
  };

  const reset = () => { setImageUrl(''); setEditingId(''); setMessage(''); setError(''); };
  const save = async () => {
    if (!imageUrl) { setError('ارفع صورة الإعلان أولًا.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const body:any = { image_url:imageUrl, title_ar:'إعلان', target_url:'#menu-section', is_active:true, sort_order:rows.length };
      if (role !== 'branch_manager') body.branch_id = branchId || null;
      if (editingId) body.id = editingId;
      const response=await fetch('/api/promo-banners',{method:editingId?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||'تعذر حفظ الإعلان');
      reset(); setMessage('تم حفظ الإعلان'); await load();
    } catch(e:any) { setError(e.message||'حدث خطأ أثناء الحفظ'); }
    finally { setBusy(false); }
  };
  const edit = (row:Banner) => { setEditingId(row.id); setImageUrl(row.image_url); setBranchId(row.branch_id || ''); setMessage(''); setError(''); };
  const remove = async (id:string) => {
    if (!window.confirm('هل تريد حذف هذا الإعلان؟')) return;
    const response=await fetch('/api/promo-banners?id='+encodeURIComponent(id),{method:'DELETE'});
    const result=await response.json();
    if(!response.ok){setError(result.error||'تعذر حذف الإعلان');return;}
    setMessage('تم حذف الإعلان'); await load();
  };
  const toggle = async (row:Banner) => {
    const response=await fetch('/api/promo-banners',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id,is_active:!row.is_active})});
    const result=await response.json();
    if(!response.ok){setError(result.error||'تعذر تحديث حالة الإعلان');return;}
    await load();
  };

  if (!['super_admin','owner','branch_manager'].includes(role)) return null;
  const field='w-full rounded-xl border border-white/10 bg-[#141417] px-3 py-3 text-xs text-[#F6F3EC] outline-none focus:border-[#F2B705]';
  return <section dir="rtl" className="rounded-2xl border border-white/10 bg-[#141417] p-4 sm:p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-base font-semibold text-[#F2B705]">إعلانات الصفحة الرئيسية</h2><p className="mt-1 text-[11px] text-[#9E9BA3]">ارفع الصورة فقط، وستظهر مباشرة في شريط العروض</p></div>
      <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-[#9E9BA3]">{role==='branch_manager'?'إعلانات فرعك':'إعلانات جميع الفروع'}</span>
    </div>
    {(error||message)&&<p role={error?'alert':'status'} className={error?'text-xs text-red-300':'text-xs text-emerald-300'}>{error||message}</p>}
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      {role!=='branch_manager'&&<select className={field} value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">جميع الفروع</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name_ar}</option>)}</select>}
      <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-[#F2B705]/50 px-4 text-xs font-semibold text-[#F2B705]">
        {uploading?'جارٍ رفع الصورة…':'اختيار صورة من الجهاز'}
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file) uploadImage(file);e.currentTarget.value='';}}/>
      </label>
    </div>
    {imageUrl&&<div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#1B1B1F] p-3">
      <img src={imageUrl} alt="معاينة الإعلان" className="h-24 w-36 rounded-lg object-cover" onError={e=>{e.currentTarget.style.opacity='0.25';setError('تعذر تحميل معاينة الصورة. أعد رفعها.');}}/>
      <div className="flex-1 text-xs text-[#9E9BA3]">معاينة الإعلان — الصورة فقط دون نصوص أو شارات فوقها</div>
      <button type="button" onClick={reset} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#F6F3EC]">إلغاء</button>
      <button type="button" disabled={busy||uploading} onClick={save} className="rounded-lg bg-[#F2B705] px-4 py-2.5 text-xs font-semibold text-[#0A0A0C] disabled:opacity-50">{busy?'جارٍ الحفظ…':editingId?'حفظ الصورة':'إضافة الإعلان'}</button>
    </div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(row=><article key={row.id} className="overflow-hidden rounded-xl border border-white/10 bg-[#1B1B1F]">
        <img src={row.image_url} alt="" className="h-36 w-full object-cover" onError={e=>{e.currentTarget.style.opacity='0.25';}}/>
        <div className="flex items-center justify-between gap-2 p-3">
          <span className="text-[10px] text-[#9E9BA3]">{row.branch_id?branches.find(b=>b.id===row.branch_id)?.name_ar||'فرع محدد':'جميع الفروع'} · {row.is_active?'نشط':'متوقف'}</span>
          <div className="flex gap-1">
            <button type="button" onClick={()=>toggle(row)} className="rounded-lg border border-white/10 px-2.5 py-2 text-[10px] text-[#F2B705]">{row.is_active?'إيقاف':'تفعيل'}</button>
            <button type="button" onClick={()=>edit(row)} className="rounded-lg border border-white/10 px-2.5 py-2 text-[10px] text-[#F6F3EC]">تعديل</button>
            <button type="button" onClick={()=>remove(row.id)} className="rounded-lg border border-red-500/30 px-2.5 py-2 text-[10px] text-red-300">حذف</button>
          </div>
        </div>
      </article>)}
      {!rows.length&&<p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-[#9E9BA3]">لا توجد إعلانات مرفوعة حتى الآن.</p>}
    </div>
  </section>;
}
