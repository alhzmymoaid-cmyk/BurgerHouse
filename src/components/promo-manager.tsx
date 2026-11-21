'use client';

import { useCallback, useEffect, useState } from 'react';

type Banner = { id:string; branch_id:string|null; title_ar:string; subtitle_ar?:string|null; badge_text?:string|null; cta_label?:string|null; target_url?:string|null; image_url:string; sort_order?:number; is_active:boolean };
type Branch = { id:string; name_ar:string };

export default function PromoManager() {
  const [rows,setRows] = useState<Banner[]>([]);
  const [branches,setBranches] = useState<Branch[]>([]);
  const [role,setRole] = useState('');
  const [branchId,setBranchId] = useState('');
  const [imageUrl,setImageUrl] = useState('');
  const [titleAr,setTitleAr] = useState('إعلان جديد');
  const [subtitleAr,setSubtitleAr] = useState('');
  const [badgeText,setBadgeText] = useState('عرض اليوم');
  const [ctaLabel,setCtaLabel] = useState('اطلب الآن');
  const [targetUrl,setTargetUrl] = useState('#menu-section');
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

  const reset = () => { setImageUrl(''); setEditingId(''); setTitleAr('إعلان جديد'); setSubtitleAr(''); setBadgeText('عرض اليوم'); setCtaLabel('اطلب الآن'); setTargetUrl('#menu-section'); setMessage(''); setError(''); };
  const save = async () => {
    if (!imageUrl) { setError('ارفع صورة الإعلان أولًا.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const body:any = { image_url:imageUrl, title_ar:titleAr.trim(), subtitle_ar:subtitleAr.trim()||null, badge_text:badgeText.trim(), cta_label:ctaLabel.trim(), target_url:targetUrl.trim()||'#menu-section', is_active:true, sort_order:editingId?(rows.find(row=>row.id===editingId)?.sort_order||0):rows.length };
      if (role !== 'branch_manager') body.branch_id = branchId || null;
      if (editingId) body.id = editingId;
      const response=await fetch('/api/promo-banners',{method:editingId?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||'تعذر حفظ الإعلان');
      reset(); setMessage('تم حفظ الإعلان'); await load();
    } catch(e:any) { setError(e.message||'حدث خطأ أثناء الحفظ'); }
    finally { setBusy(false); }
  };
  const edit = (row:Banner) => { setEditingId(row.id); setImageUrl(row.image_url); setTitleAr(row.title_ar||''); setSubtitleAr(row.subtitle_ar||''); setBadgeText(row.badge_text||'عرض اليوم'); setCtaLabel(row.cta_label||'اطلب الآن'); setTargetUrl(row.target_url||'#menu-section'); setBranchId(row.branch_id || ''); setMessage(''); setError(''); };
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
  const field='w-full rounded-xl border border-[#52525B] bg-[#09090B] px-3 py-3 text-sm text-[#FAFAFA] placeholder:text-[#A1A1AA] outline-none focus:border-[#F5B800] focus:ring-2 focus:ring-[#F5B800]/20';
  return <section dir="rtl" className="rounded-2xl border border-white/10 bg-[#141417] p-4 sm:p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-base font-semibold text-[#F2B705]">إعلانات الصفحة الرئيسية</h2><p className="mt-1 text-xs text-[#D4D4D8]">تحكم في صورة الإعلان ونصوصه وزر الإجراء ورابطه.</p></div>
      <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-[#9E9BA3]">{role==='branch_manager'?'إعلانات فرعك':'إعلانات جميع الفروع'}</span>
    </div>
    {(error||message)&&<p role={error?'alert':'status'} className={error?'text-xs text-red-300':'text-xs text-emerald-300'}>{error||message}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      {role!=='branch_manager'&&<label className="block text-xs font-semibold text-[#E4E4E7]">نطاق الإعلان<select className={field+" mt-2"} value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">جميع الفروع</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name_ar}</option>)}</select></label>}
      <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-[#F5B800]/60 bg-[#1A1A20] px-4 text-sm font-bold text-[#F5B800]">
        {uploading?'جارٍ رفع الصورة…':'اختيار صورة من الاستوديو'}
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file) uploadImage(file);e.currentTarget.value='';}}/>
      </label>
      <label className="block text-xs font-semibold text-[#E4E4E7]">عنوان الإعلان<input className={field+" mt-2"} value={titleAr} onChange={e=>setTitleAr(e.target.value)} placeholder="مثلاً: عرض نهاية الأسبوع"/></label>
      <label className="block text-xs font-semibold text-[#E4E4E7]">النص الإضافي<input className={field+" mt-2"} value={subtitleAr} onChange={e=>setSubtitleAr(e.target.value)} placeholder="وصف قصير للعرض (اختياري)"/></label>
      <label className="block text-xs font-semibold text-[#E4E4E7]">الشارة<input className={field+" mt-2"} value={badgeText} onChange={e=>setBadgeText(e.target.value)} placeholder="عرض اليوم"/></label>
      <label className="block text-xs font-semibold text-[#E4E4E7]">نص الزر<input className={field+" mt-2"} value={ctaLabel} onChange={e=>setCtaLabel(e.target.value)} placeholder="اطلب الآن"/></label>
      <label className="block text-xs font-semibold text-[#E4E4E7] sm:col-span-2">الرابط عند الضغط<input className={field+" mt-2"} dir="ltr" value={targetUrl} onChange={e=>setTargetUrl(e.target.value)} placeholder="#menu-section أو رابط صفحة"/></label>
    </div>
    {imageUrl&&<div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#1B1B1F] p-3">
      <img src={imageUrl} alt="معاينة الإعلان" className="h-24 w-36 rounded-lg object-cover" onError={e=>{e.currentTarget.style.opacity='0.25';setError('تعذر تحميل معاينة الصورة. أعد رفعها.');}}/>
      <div className="flex-1 text-xs text-[#D4D4D8]"><b className="block text-sm text-[#FAFAFA]">{titleAr}</b><span>{subtitleAr||"معاينة نص الإعلان"}</span></div>
      <button type="button" onClick={reset} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#F6F3EC]">إلغاء</button>
      <button type="button" disabled={busy||uploading} onClick={save} className="rounded-lg bg-[#F2B705] px-4 py-2.5 text-xs font-semibold text-[#0A0A0C] disabled:opacity-50">{busy?'جارٍ الحفظ…':editingId?'حفظ الإعلان':'إضافة الإعلان'}</button>
    </div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(row=><article key={row.id} className="overflow-hidden rounded-xl border border-white/10 bg-[#1B1B1F]">
        <img src={row.image_url} alt="" className="h-36 w-full object-cover" onError={e=>{e.currentTarget.style.opacity='0.25';}}/>
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="min-w-0"><b className="block truncate text-xs text-[#FAFAFA]">{row.title_ar}</b><span className="text-[10px] text-[#D4D4D8]">{row.branch_id?branches.find(b=>b.id===row.branch_id)?.name_ar||'فرع محدد':'جميع الفروع'} · {row.is_active?'نشط':'متوقف'}</span></div>
          <div className="flex gap-1">
            <button type="button" onClick={()=>toggle(row)} className="rounded-lg border border-[#71717A] bg-[#27272A] px-2.5 py-2 text-[10px] font-bold text-[#F5B800]">{row.is_active?'إيقاف':'تفعيل'}</button>
            <button type="button" onClick={()=>edit(row)} className="rounded-lg border border-[#71717A] bg-[#27272A] px-2.5 py-2 text-[10px] font-bold text-[#FAFAFA]">✎ تعديل</button>
            <button type="button" onClick={()=>remove(row.id)} className="rounded-lg border border-red-400/60 bg-red-950/40 px-2.5 py-2 text-[10px] font-bold text-red-200">حذف</button>
          </div>
        </div>
      </article>)}
      {!rows.length&&<p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-[#9E9BA3]">لا توجد إعلانات مرفوعة حتى الآن.</p>}
    </div>
  </section>;
}
