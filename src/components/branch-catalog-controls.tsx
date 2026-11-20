'use client';

import { useCallback,useEffect,useState } from 'react';

type Product={id:string;name_ar:string};
type Category={id:string;name_ar:string};
type Control={product_id?:string;category_id?:string;manual_disabled?:boolean;sold_out_until?:string|null;is_active?:boolean};
export default function BranchCatalogControls(){
 const [products,setProducts]=useState<Product[]>([]),[categories,setCategories]=useState<Category[]>([]);
 const [pc,setPc]=useState<Control[]>([]),[cc,setCc]=useState<Control[]>([]);
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const load=useCallback(async()=>{const r=await fetch('/api/branch/catalog-controls',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر تحميل أصناف الفرع');setProducts(d.products||[]);setCategories(d.categories||[]);setPc(d.product_controls||[]);setCc(d.category_controls||[]);},[]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 const updateProduct=async(id:string,key:'sold_out_today'|'manual_disabled',value:boolean)=>{setBusy(id+key);setError('');try{const r=await fetch('/api/branch/catalog-controls',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity:'product',product_id:id,[key]:value})});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر تحديث الصنف');await load();}catch(e:any){setError(e.message)}finally{setBusy('')}};
 const updateCategory=async(id:string,value:boolean)=>{setBusy(id);setError('');try{const r=await fetch('/api/branch/catalog-controls',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity:'category',category_id:id,is_active:value})});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر تحديث القسم');await load();}catch(e:any){setError(e.message)}finally{setBusy('')}};
 const field='flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-[#c8c8cf]';
 return <section dir="rtl" className="rounded-2xl border border-white/10 bg-[#131317] p-4 sm:p-5 space-y-4">
  <div><h2 className="text-base font-black text-[#F5B800]">توفر المنيو في هذا الفرع</h2><p className="mt-1 text-[11px] text-[#A1A1AA]">تغييراتك تخص فرعك فقط ولا تؤثر على الفروع الأخرى</p></div>
  {error&&<p className="text-xs text-red-300">{error}</p>}
  <div className="grid gap-2 sm:grid-cols-2">
   {products.map(p=>{const c=pc.find(x=>x.product_id===p.id);const sold=!!c?.sold_out_until&&new Date(c.sold_out_until).getTime()>Date.now();return <div key={p.id} className="rounded-xl border border-white/10 bg-[#09090B] p-3"><b className="mb-2 block text-xs text-white">{p.name_ar}</b><div className="flex flex-wrap gap-2"><label className={field}><input type="checkbox" checked={sold} disabled={!!busy} onChange={e=>updateProduct(p.id,'sold_out_today',e.target.checked)}/> منتهي اليوم</label><label className={field}><input type="checkbox" checked={!!c?.manual_disabled} disabled={!!busy} onChange={e=>updateProduct(p.id,'manual_disabled',e.target.checked)}/> إيقاف يدوي</label></div></div>})}
  </div>
  <div><h3 className="mb-2 text-sm font-bold text-white">إظهار أقسام المنيو</h3><div className="flex flex-wrap gap-2">{categories.map(cat=>{const c=cc.find(x=>x.category_id===cat.id);const active=c?.is_active!==false;return <label key={cat.id} className={field}><input type="checkbox" checked={active} disabled={!!busy} onChange={e=>updateCategory(cat.id,e.target.checked)}/>{cat.name_ar}</label>})}</div></div>
 </section>;
}
