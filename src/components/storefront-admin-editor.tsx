'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import PromoManager from '@/components/promo-manager';

type ProductForm = {
  id:string; category_id:string; name_ar:string; name_en:string; description_ar:string; description_en:string;
  base_price:string; image_url:string; prep_minutes:string; calories:string; sort_order:string;
  is_featured:boolean; is_active:boolean; allowed_addon_ids:string[]; sizes:any[];
};
const blankProduct=(categoryId=''):ProductForm=>({
  id:'',category_id:categoryId,name_ar:'',name_en:'',description_ar:'',description_en:'',
  base_price:'',image_url:'',prep_minutes:'12',calories:'650',sort_order:'0',
  is_featured:false,is_active:true,allowed_addon_ids:[],sizes:[]
});
const inputClass='w-full rounded-lg border border-[#52525B] bg-[#09090B] px-3 py-3 text-sm text-[#FAFAFA] placeholder:text-[#A1A1AA] outline-none focus:border-[#F5B800] focus:ring-2 focus:ring-[#F5B800]/20';

export default function StorefrontAdminEditor(){
  const [profile,setProfile]=useState<any>(null);
  const [data,setData]=useState<any>(null);
  const [enabled,setEnabled]=useState(false);
  const [open,setOpen]=useState(false);
  const [tab,setTab]=useState<'products'|'categories'|'addons'|'promos'>('products');
  const [productForm,setProductForm]=useState<ProductForm>(blankProduct());
  const [editing,setEditing]=useState(false);
  const [categoryForm,setCategoryForm]=useState<any>({id:'',name_ar:'',name_en:'',sort_order:'0',is_active:true});
  const [addonForm,setAddonForm]=useState<any>({id:'',name_ar:'',name_en:'',price:'',max_per_item:'3',is_active:true});
  const [sizeForm,setSizeForm]=useState<any>({name_ar:'',name_en:'',price_delta:'0'});
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const load=useCallback(async()=>{
    try{
      const {data:{user}}=await createSupabaseBrowserClient().auth.getUser();
      if(!user)return;
      const response=await fetch('/api/admin/catalog',{cache:'no-store',credentials:'same-origin'});
      if(!response.ok)return;
      const result=await response.json();
      const canManage = ['super_admin','owner'].includes(result.profile?.role)
        || (result.profile?.role === 'branch_manager' && Array.isArray(result.profile?.permissions) && result.profile.permissions.includes('catalog_manage'));
      if(!canManage)return;
      setProfile(result.profile);
      setData(result);
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('admin') === '1') { setEnabled(true); setOpen(true); }
    }catch{
      setProfile(null);
    }
  },[]);
  useEffect(()=>{void load();},[load]);

  const callAction=async(payload:any)=>{
    const response=await fetch('/api/admin/catalog',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.message_ar||result.error||'تعذر حفظ التغيير.');
    return result;
  };

  const startNewProduct=()=>{
    setProductForm(blankProduct(data?.categories?.find((c:any)=>c.is_active)?.id||''));
    setEditing(false);setTab('products');setError('');setMessage('');
  };
  const startEditProduct=(product:any)=>{
    setProductForm({
      id:product.id,category_id:product.category_id,name_ar:product.name_ar,name_en:product.name_en,
      description_ar:product.description_ar||'',description_en:product.description_en||'',
      base_price:String(product.base_price),image_url:product.image_url||'',prep_minutes:String(product.prep_minutes||12),
      calories:String(product.calories||650),sort_order:String(product.sort_order||0),is_featured:Boolean(product.is_featured),
      is_active:product.is_active!==false,allowed_addon_ids:product.allowed_addon_ids||[],
      sizes:(product.product_sizes||[]).map((size:any)=>({...size}))
    });
    setEditing(true);setError('');setMessage('');
  };

  const uploadImage=async(file?:File)=>{
    if(!file)return;
    setUploading(true);setError('');setMessage('');
    try{
      if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('اختر صورة JPG أو PNG أو WebP.');
      if(file.size>5*1024*1024)throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميجابايت.');
      const form=new FormData();form.append('file',file);
      const response=await fetch('/api/media/upload',{method:'POST',body:form,credentials:'same-origin'});
      const result=await response.json();
      if(!response.ok||!result.public_url)throw new Error(result.message||result.error||'فشل رفع الصورة.');
      setProductForm(current=>({...current,image_url:result.public_url}));
      setMessage('تم رفع الصورة إلى مكتبة الصور. احفظ المنتج لتطبيقها.');
    }catch(e:any){setError(e.message||'تعذر رفع الصورة.');}
    finally{setUploading(false);}
  };

  const saveProduct=async(event:any)=>{
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      if(!productForm.category_id)throw new Error('اختر قسم المنتج.');
      if(!productForm.name_ar.trim()||!productForm.name_en.trim())throw new Error('أدخل اسم المنتج بالعربية والإنجليزية.');
      const id=productForm.id||('bh-'+crypto.randomUUID().replace(/-/g,'').slice(0,16));
      await callAction({action:'UPSERT_PRODUCT',product:{
        id,category_id:productForm.category_id,name_ar:productForm.name_ar.trim(),name_en:productForm.name_en.trim(),
        description_ar:productForm.description_ar.trim(),description_en:productForm.description_en.trim(),
        base_price:Number(productForm.base_price),image_url:productForm.image_url,
        prep_minutes:Number(productForm.prep_minutes||12),calories:Number(productForm.calories||650),
        sort_order:Number(productForm.sort_order||0),is_featured:productForm.is_featured,
        is_active:productForm.is_active,allowed_addon_ids:productForm.allowed_addon_ids,
        sizes:productForm.sizes.map((size:any,index:number)=>({...size,id:size.id||('sz-'+crypto.randomUUID().replace(/-/g,'').slice(0,14)),sort_order:index}))
      }});
      setMessage('تم حفظ المنتج.');
      await load();setEditing(false);setProductForm(blankProduct());
    }catch(e:any){setError(e.message||'تعذر حفظ المنتج.');}
    finally{setBusy(false);}
  };

  const addSize=()=>{
    if(!sizeForm.name_ar.trim()||!sizeForm.name_en.trim())return;
    setProductForm(current=>({...current,sizes:[...current.sizes,{id:'sz-'+crypto.randomUUID().replace(/-/g,'').slice(0,14),name_ar:sizeForm.name_ar.trim(),name_en:sizeForm.name_en.trim(),price_delta:Number(sizeForm.price_delta||0),is_default:current.sizes.length===0,sort_order:current.sizes.length}]}));
    setSizeForm({name_ar:'',name_en:'',price_delta:'0'});
  };

  const saveCategory=async(event:any)=>{
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      await callAction({action:'UPSERT_CATEGORY',category:{...categoryForm,id:categoryForm.id||('cat-'+crypto.randomUUID().replace(/-/g,'').slice(0,14)),sort_order:Number(categoryForm.sort_order||0)}});
      setMessage('تم حفظ القسم.');setCategoryForm({id:'',name_ar:'',name_en:'',sort_order:String((data?.categories?.length||0)+1),is_active:true});await load();
    }catch(e:any){setError(e.message||'تعذر حفظ القسم.');}
    finally{setBusy(false);}
  };

  const saveAddon=async(event:any)=>{
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      await callAction({action:'UPSERT_ADDON',addon:{...addonForm,id:addonForm.id||('addon-'+crypto.randomUUID().replace(/-/g,'').slice(0,14)),price:Number(addonForm.price),max_per_item:Number(addonForm.max_per_item||3)}});
      setMessage('تم حفظ الإضافة.');setAddonForm({id:'',name_ar:'',name_en:'',price:'',max_per_item:'3',is_active:true});await load();
    }catch(e:any){setError(e.message||'تعذر حفظ الإضافة.');}
    finally{setBusy(false);}
  };

  const deactivate=async(action:string,key:string,id:string)=>{
    const prompt = action.startsWith('DELETE_') ? 'تأكيد الحذف: سيُحذف العنصر إن لم يكن مرتبطًا بسجلات، وإلا سيُؤرشف ويختفي من المنيو. هل تريد المتابعة؟' : 'سيتم إخفاء العنصر من المتجر دون حذف بياناته. هل تريد المتابعة؟';
    if(!window.confirm(prompt))return;
    setBusy(true);setError('');setMessage('');
    try{await callAction({action,[key]:id});setMessage('تم تحديث حالة العنصر في المنيو.');await load();}
    catch(e:any){setError(e.message||'تعذر تنفيذ الإجراء.');}
    finally{setBusy(false);}
  };

  if(!profile||!['super_admin','owner'].includes(profile.role))return null;

  return <>
    {!enabled?<button type="button" onClick={()=>setEnabled(true)} className="fixed bottom-24 right-4 z-[85] rounded-xl border border-[#F2B705]/50 bg-[#141417] px-4 py-3 text-xs font-bold text-[#F2B705] shadow-xl">تعديل المتجر والمنيو</button>
    :<div className="fixed inset-x-0 top-[calc(72px+env(safe-area-inset-top))] z-[85] flex flex-wrap items-center justify-between gap-2 border-y border-[#F2B705]/30 bg-[#141417] px-4 py-3 shadow-lg">
      <span className="text-xs font-bold text-[#F2B705]">وضع الإدارة مفعّل</span>
      <div className="flex flex-wrap gap-2"><button onClick={()=>{setOpen(true);setTab('products');}} className="rounded-lg bg-[#F2B705] px-3 py-2 text-[11px] font-bold text-[#0A0A0C]">إدارة المنتجات والأقسام</button><button onClick={()=>setEnabled(false)} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-[#F6F3EC]">إغلاق وضع الإدارة</button></div>
    </div>}

    {open&&<div className="fixed inset-0 z-[110] overflow-y-auto bg-black/75 p-3 sm:p-6" dir="rtl">
      <section className="mx-auto my-4 max-w-5xl rounded-2xl border border-white/10 bg-[#141417] p-4 text-[#F6F3EC] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><span className="text-[10px] tracking-[.16em] text-[#F2B705]">VISUAL STORE EDITOR</span><h2 className="mt-1 text-xl font-bold">إدارة المتجر والمنيو</h2></div><button onClick={()=>{setOpen(false);setEditing(false);}} className="rounded-lg border border-white/10 px-3 py-2 text-xs">إغلاق</button></div>
        <div className="mt-5 flex flex-wrap gap-2 border-b border-white/10 pb-4">
          {(['products','categories','addons','promos'] as const).map(key=><button key={key} onClick={()=>{setTab(key);setError('');setMessage('');}} className={tab===key?'rounded-lg bg-[#F2B705] px-4 py-2 text-xs font-bold text-[#0A0A0C]':'rounded-lg border border-white/10 px-4 py-2 text-xs text-[#9E9BA3]'}>{key==='products'?'المنتجات':key==='categories'?'الأقسام':key==='addons'?'الإضافات':'العروض'}</button>)}
        </div>
        {(error||message)&&<p role={error?'alert':'status'} className={error?'mt-4 text-xs text-red-300':'mt-4 text-xs text-emerald-300'}>{error||message}</p>}

        {tab==='products'&&<div className="mt-4 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3">
            <button onClick={startNewProduct} className="w-full rounded-lg bg-[#F2B705] px-4 py-3 text-xs font-bold text-[#0A0A0C]">+ أضف منتج</button>
            <div className="max-h-[65vh] space-y-2 overflow-y-auto">
              {(data?.products||[]).map((product:any)=><article key={product.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1B1B1F] p-3">
                <img src={product.image_url} alt="" className="h-14 w-14 rounded-lg object-cover"/>
                <div className="min-w-0 flex-1"><b className="block truncate text-xs">{product.name_ar}</b><span className="text-[10px] text-[#F2B705]">{Number(product.base_price).toFixed(2)} ر.س · {product.is_active?'نشط':'مخفي'}</span></div>
                <button onClick={()=>startEditProduct(product)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px]">تعديل</button>
                <button onClick={()=>deactivate('DELETE_PRODUCT','product_id',product.id)} className="rounded-lg border border-red-500/50 bg-red-950/30 px-2 py-2 text-[10px] font-bold text-red-200">حذف</button>
              </article>)}
            </div>
          </div>
          <form onSubmit={saveProduct} className="space-y-3 rounded-xl border border-white/10 bg-[#1B1B1F] p-4">
            <h3 className="text-sm font-bold">{editing?'تعديل المنتج':'إضافة منتج جديد'}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] text-[#9E9BA3]">الاسم بالعربية<input required value={productForm.name_ar} onChange={e=>setProductForm((v:ProductForm)=>({...v,name_ar:e.target.value}))} className={inputClass}/></label>
              <label className="text-[11px] text-[#9E9BA3]">الاسم بالإنجليزية<input required dir="ltr" value={productForm.name_en} onChange={e=>setProductForm((v:ProductForm)=>({...v,name_en:e.target.value}))} className={inputClass}/></label>
              <label className="text-[11px] text-[#9E9BA3]">السعر<input required min="0" step="0.01" type="number" value={productForm.base_price} onChange={e=>setProductForm((v:ProductForm)=>({...v,base_price:e.target.value}))} className={inputClass}/></label>
              <label className="text-[11px] text-[#9E9BA3]">القسم<select required value={productForm.category_id} onChange={e=>setProductForm((v:ProductForm)=>({...v,category_id:e.target.value}))} className={inputClass}><option value="">اختر القسم</option>{(data?.categories||[]).filter((x:any)=>x.is_active).map((x:any)=><option key={x.id} value={x.id}>{x.name_ar}</option>)}</select></label>
              <label className="text-[11px] text-[#9E9BA3]">وقت التجهيز بالدقائق<input type="number" min="1" value={productForm.prep_minutes} onChange={e=>setProductForm((v:ProductForm)=>({...v,prep_minutes:e.target.value}))} className={inputClass}/></label>
              <label className="text-[11px] text-[#9E9BA3]">ترتيب العرض<input type="number" value={productForm.sort_order} onChange={e=>setProductForm((v:ProductForm)=>({...v,sort_order:e.target.value}))} className={inputClass}/></label>
            </div>
            <label className="block text-[11px] text-[#9E9BA3]">الوصف بالعربية<textarea rows={2} value={productForm.description_ar} onChange={e=>setProductForm((v:ProductForm)=>({...v,description_ar:e.target.value}))} className={inputClass}/></label>
            <label className="block text-[11px] text-[#9E9BA3]">الوصف بالإنجليزية<textarea dir="ltr" rows={2} value={productForm.description_en} onChange={e=>setProductForm((v:ProductForm)=>({...v,description_en:e.target.value}))} className={inputClass}/></label>
            <div className="rounded-xl border border-[#52525B] bg-[#09090B] p-3 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm text-[#FAFAFA]">صورة المنتج</b><label className="cursor-pointer rounded-lg bg-[#F5B800] px-4 py-2.5 text-xs font-black text-[#09090B]">{uploading?'جارٍ رفع الصورة…':'اختر صورة من الاستوديو'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={e=>{void uploadImage(e.target.files?.[0]);e.currentTarget.value='';}}/></label></div>{productForm.image_url?<div className="flex items-center gap-3"><img src={productForm.image_url} alt="معاينة صورة المنتج" className="h-24 w-24 rounded-xl border border-white/10 object-cover"/><div className="space-y-2"><p className="text-xs text-[#D4D4D8]">الصورة الحالية ستظهر مباشرة في المنيو بعد الحفظ.</p><button type="button" onClick={()=>setProductForm(v=>({...v,image_url:''}))} className="rounded-lg border border-red-400/50 px-3 py-2 text-xs font-bold text-red-300">إزالة الصورة</button></div></div>:<p className="text-xs text-[#A1A1AA]">لا توجد صورة محددة. يمكنك الحفظ دون صورة أو اختيار صورة جديدة.</p>}<div><p className="mb-2 text-xs font-bold text-[#E4E4E7]">أو اختر صورة مستخدمة في منتج آخر</p><div className="flex gap-2 overflow-x-auto pb-2">{Array.from(new Map((data?.products||[]).filter((p:any)=>p.image_url).map((p:any)=>[p.image_url,p])).values()).map((p:any)=><button type="button" key={p.image_url} onClick={()=>setProductForm(v=>({...v,image_url:p.image_url}))} title={p.name_ar} className={`shrink-0 rounded-lg border-2 p-1 ${productForm.image_url===p.image_url?'border-[#F5B800]':'border-[#52525B]'}`}><img src={p.image_url} alt={p.name_ar} className="h-16 w-16 rounded-md object-cover"/><span className="block max-w-16 truncate pt-1 text-[9px] text-[#E4E4E7]">{p.name_ar}</span></button>)}</div></div></div>
            <div className="rounded-lg border border-white/10 p-3"><b className="text-xs">الإضافات المتاحة لهذا المنتج</b><div className="mt-2 grid grid-cols-2 gap-2">{(data?.addons||[]).filter((a:any)=>a.is_active).map((addon:any)=><label key={addon.id} className="flex items-center gap-2 text-[11px] text-[#9E9BA3]"><input type="checkbox" checked={productForm.allowed_addon_ids.includes(addon.id)} onChange={e=>setProductForm((v:ProductForm)=>({...v,allowed_addon_ids:e.target.checked?[...v.allowed_addon_ids,addon.id]:v.allowed_addon_ids.filter(id=>id!==addon.id)}))}/>{addon.name_ar} · {addon.price} ر.س</label>)}</div></div>
            <div className="rounded-lg border border-white/10 p-3"><b className="text-xs">الأحجام</b><div className="mt-2 space-y-2">{productForm.sizes.map((size:any,index:number)=><div key={size.id||index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"><input value={size.name_ar} onChange={e=>setProductForm((v:ProductForm)=>({...v,sizes:v.sizes.map((s:any,i:number)=>i===index?{...s,name_ar:e.target.value}:s)}))} placeholder="الحجم بالعربية" className={inputClass}/><input dir="ltr" value={size.name_en} onChange={e=>setProductForm((v:ProductForm)=>({...v,sizes:v.sizes.map((s:any,i:number)=>i===index?{...s,name_en:e.target.value}:s)}))} placeholder="Size" className={inputClass}/><input type="number" step="0.01" value={size.price_delta} onChange={e=>setProductForm((v:ProductForm)=>({...v,sizes:v.sizes.map((s:any,i:number)=>i===index?{...s,price_delta:Number(e.target.value)}:s)}))} placeholder="فرق السعر" className={inputClass}/><button type="button" onClick={()=>setProductForm(v=>({...v,sizes:v.sizes.filter((_:any,i:number)=>i!==index)}))} className="rounded-lg border border-red-500/40 px-3 text-xs text-red-300" aria-label="حذف الحجم">×</button></div>)}</div><div className="mt-3 grid grid-cols-3 gap-2"><input value={sizeForm.name_ar} onChange={e=>setSizeForm((v:any)=>({...v,name_ar:e.target.value}))} placeholder="حجم جديد" className={inputClass}/><input dir="ltr" value={sizeForm.name_en} onChange={e=>setSizeForm((v:any)=>({...v,name_en:e.target.value}))} placeholder="New size" className={inputClass}/><input type="number" step="0.01" value={sizeForm.price_delta} onChange={e=>setSizeForm((v:any)=>({...v,price_delta:e.target.value}))} placeholder="فرق السعر" className={inputClass}/></div><button type="button" onClick={addSize} className="mt-2 text-[11px] font-bold text-[#F2B705]">+ إضافة حجم</button></div>
            <div className="flex flex-wrap gap-4 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={productForm.is_featured} onChange={e=>setProductForm((v:ProductForm)=>({...v,is_featured:e.target.checked}))}/>منتج مميز</label><label className="flex items-center gap-2"><input type="checkbox" checked={productForm.is_active} onChange={e=>setProductForm((v:ProductForm)=>({...v,is_active:e.target.checked}))}/>ظاهر في المنيو</label></div>
            <button disabled={busy||uploading} className="w-full rounded-lg bg-[#F5B800] px-4 py-3 text-sm font-black text-[#09090B] disabled:opacity-40">{busy?'جارٍ الحفظ…':'حفظ المنتج'}</button>
          </form>
        </div>}

        {tab==='categories'&&<div className="mt-4 grid gap-4 lg:grid-cols-2">
          <form onSubmit={saveCategory} className="space-y-3 rounded-xl border border-white/10 bg-[#1B1B1F] p-4"><h3 className="text-sm font-bold">إضافة أو تعديل قسم</h3><input value={categoryForm.name_ar} onChange={e=>setCategoryForm((v:any)=>({...v,name_ar:e.target.value}))} placeholder="اسم القسم بالعربية" className={inputClass}/><input dir="ltr" value={categoryForm.name_en} onChange={e=>setCategoryForm((v:any)=>({...v,name_en:e.target.value}))} placeholder="Category name" className={inputClass}/><input type="number" value={categoryForm.sort_order} onChange={e=>setCategoryForm((v:any)=>({...v,sort_order:e.target.value}))} placeholder="ترتيب العرض" className={inputClass}/><button disabled={busy} className="rounded-lg bg-[#F2B705] px-4 py-3 text-xs font-bold text-[#0A0A0C]">حفظ القسم</button></form>
          <div className="space-y-2">{(data?.categories||[]).map((category:any)=><div key={category.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#1B1B1F] p-3"><div><b className="text-xs">{category.name_ar}</b><p className="text-[10px] text-[#9E9BA3]">{category.is_active?'ظاهر':'مخفي'}</p></div><div className="flex gap-2"><button onClick={()=>setCategoryForm({...category,sort_order:String(category.sort_order)})} className="rounded-lg border border-white/10 px-3 py-2 text-[10px]">تعديل</button><button onClick={()=>deactivate('DELETE_CATEGORY','category_id',category.id)} className="rounded-lg border border-red-500/50 bg-red-950/30 px-3 py-2 text-[10px] font-bold text-red-200">حذف</button></div></div>)}</div>
        </div>}

        {tab==='promos'&&<div className="mt-4"><PromoManager /></div>}

        {tab==='addons'&&<div className="mt-4 grid gap-4 lg:grid-cols-2">
          <form onSubmit={saveAddon} className="space-y-3 rounded-xl border border-white/10 bg-[#1B1B1F] p-4"><h3 className="text-sm font-bold">إضافة أو تعديل إضافة</h3><input value={addonForm.name_ar} onChange={e=>setAddonForm((v:any)=>({...v,name_ar:e.target.value}))} placeholder="اسم الإضافة بالعربية" className={inputClass}/><input dir="ltr" value={addonForm.name_en} onChange={e=>setAddonForm((v:any)=>({...v,name_en:e.target.value}))} placeholder="Addon name" className={inputClass}/><input type="number" min="0" step="0.01" value={addonForm.price} onChange={e=>setAddonForm((v:any)=>({...v,price:e.target.value}))} placeholder="السعر" className={inputClass}/><input type="number" min="1" max="10" value={addonForm.max_per_item} onChange={e=>setAddonForm((v:any)=>({...v,max_per_item:e.target.value}))} placeholder="الحد الأقصى" className={inputClass}/><button disabled={busy} className="rounded-lg bg-[#F2B705] px-4 py-3 text-xs font-bold text-[#0A0A0C]">حفظ الإضافة</button></form>
          <div className="space-y-2">{(data?.addons||[]).map((addon:any)=><div key={addon.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#1B1B1F] p-3"><div><b className="text-xs">{addon.name_ar}</b><p className="text-[10px] text-[#9E9BA3]">{addon.price} ر.س · {addon.is_active?'نشطة':'مخفية'}</p></div><div className="flex gap-2"><button onClick={()=>setAddonForm({...addon,price:String(addon.price),max_per_item:String(addon.max_per_item)})} className="rounded-lg border border-white/10 px-3 py-2 text-[10px]">تعديل</button><button onClick={()=>deactivate('DELETE_ADDON','addon_id',addon.id)} className="rounded-lg border border-red-500/50 bg-red-950/30 px-3 py-2 text-[10px] font-bold text-red-200">حذف</button></div></div>)}</div>
        </div>}
      </section>
    </div>}
  </>;
}
