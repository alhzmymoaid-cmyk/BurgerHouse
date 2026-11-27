'use client';

import { Clock3, Heart, MapPin, Minus, Navigation, Plus, Search, ShoppingBag, X } from 'lucide-react';
import SafeFoodImage from '@/components/safe-food-image';

export type StorefrontSize = { id: string; name_ar: string; price_delta: number; is_default?: boolean };
export type StorefrontAddon = { id: string; name_ar: string; price: number; max_per_item?: number };
export type StorefrontProduct = {
  id: string; category_id: string; name_ar: string; name_en?: string;
  description_ar: string; base_price: number; image_url: string;
  is_featured?: boolean; prep_minutes?: number; sizes?: StorefrontSize[]; allowed_addon_ids?: string[];
};
export type StorefrontBranch = {
  id: string; name_ar: string; address_ar: string; phone?: string;
  open_time?: string; close_time?: string; is_active?: boolean;
  is_accepting_orders?: boolean; prep_time_minutes?: number; map_url?: string;
};
export type StorefrontCartLine = {
  key: string; product: StorefrontProduct; size?: StorefrontSize; addonIds: string[];
  quantity: number; note: string;
};
const money = (value: number) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(value);

export function StorefrontBranchPicker(props: {
  branches: StorefrontBranch[]; branchId: string; activeBranch?: StorefrontBranch;
  locationBusy: boolean; locationMessage: string;
  onBranchChange: (id: string) => void; onDetectLocation: () => void;
}) {
  const { branches, branchId, activeBranch, locationBusy, locationMessage, onBranchChange, onDetectLocation } = props;
  return <section className="bh-branch-picker border-b border-white/10 bg-[#18181c]">
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
      <div className="bh-branch-picker-copy"><p className="text-[10px] font-black tracking-[.16em] text-[#fbbf24]">طريقة الاستلام</p><h2 className="mt-1 text-lg font-black text-[#f4f4f5]">استلامك يبدأ من هنا</h2><p className="mt-1 text-xs text-[#a1a1aa]">التوصيل المنزلي غير متاح حالياً؛ اختر فرع الاستلام المناسب.</p><div className="bh-fulfillment-switch"><span className="is-active">استلام من الفرع</span><span className="is-disabled" aria-disabled="true">التوصيل غير متاح</span></div></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-[240px]"><MapPin size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#f59e0b]"/><select aria-label="اختر فرع الاستلام" value={branchId} onChange={e=>onBranchChange(e.target.value)} className="min-h-12 w-full appearance-none rounded-xl border border-[#2e2e36] bg-[#202026] px-10 py-3 text-sm font-bold text-[#f4f4f5] outline-none focus:border-[#f59e0b]">{branches.filter(b=>b.is_active).map(b=><option key={b.id} value={b.id}>{b.name_ar}{b.is_accepting_orders?'':' — لا يستقبل طلبات'}</option>)}</select></label>
        <button type="button" disabled={locationBusy} onClick={onDetectLocation} className="bh-nearest-branch-button inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 text-xs font-bold text-amber-300 transition hover:bg-amber-500/15 disabled:opacity-60"><Navigation size={15}/>{locationBusy?'جارٍ تحديد موقعك…':'استخدم موقعي'}</button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#a1a1aa] sm:basis-full sm:justify-end"><span>{activeBranch?.address_ar || 'لم يتم تحديد الفرع'}</span>{activeBranch?.open_time && activeBranch?.close_time && <span>ساعات العمل: {activeBranch.open_time} – {activeBranch.close_time}</span>}{activeBranch?.is_accepting_orders !== undefined && <span className={activeBranch.is_accepting_orders?'text-emerald-700':'text-amber-700'}>{activeBranch.is_accepting_orders?'يستقبل الطلبات':'لا يستقبل الطلبات حاليًا'}</span>}</div>
      {locationMessage && <p className="basis-full text-xs font-semibold text-[#a43b2e]" role="status">{locationMessage}</p>}
    </div>
  </section>;
}

export function StorefrontMenu(props: {
  categories: {id:string;name_ar:string}[]; groups: {id:string;name_ar:string;products:StorefrontProduct[]}[];
  loading:boolean; error:string; activeCategory:string; search:string; showFavoritesOnly:boolean;
  favoriteIds:string[]; favoriteBusy:string|null; branchId:string; activeBranch?:StorefrontBranch;
  basePrice:(product:StorefrontProduct)=>number; onCategory:(id:string)=>void; onSearch:(value:string)=>void;
  onToggleFavorites:()=>void; onToggleFavorite:(id:string)=>void; onOpenProduct:(product:StorefrontProduct)=>void;
  railRef?: React.RefObject<HTMLDivElement>;
}) {
  const p=props;
  return <section id="menu-section" className="bh-storefront-menu mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[10px] font-black tracking-[.22em] text-[#fbbf24]">THE MENU</p><h2 className="mt-2 text-3xl font-black tracking-tight text-[#f4f4f5] sm:text-4xl">قائمة برجر هاوس</h2><p className="mt-2 text-sm text-[#a1a1aa]">اختر صنفك، حدّد الحجم والإضافات، واستمتع بوجبتك.</p></div>
      <label className="relative w-full sm:max-w-xs"><Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]"/><input value={p.search} onChange={e=>p.onSearch(e.target.value)} placeholder="ابحث عن برجر أو مقبلات أو مشروب" className="min-h-12 w-full rounded-xl border border-[#2e2e36] bg-[#202026] py-3 pl-4 pr-10 text-sm text-[#f4f4f5] outline-none placeholder:text-[#989084] focus:border-[#f59e0b]"/></label>
    </div>
    <div ref={p.railRef} className="sticky z-30 -mx-4 mb-8 flex gap-2 overflow-x-auto border-y border-[#2e2e36] bg-[#18181c]/95 px-4 py-3 backdrop-blur-md lg:-mx-8 lg:px-8" style={{top:'calc(68px + env(safe-area-inset-top))'}}>
      {[{id:'all',name_ar:'كل الأصناف'},...p.categories].map(c=><button key={c.id} type="button" data-category-id={c.id} aria-pressed={p.activeCategory===c.id} onClick={()=>p.onCategory(c.id)} className={p.activeCategory===c.id?'min-h-10 shrink-0 rounded-full border border-[#292722] bg-[#292722] px-5 text-xs font-bold text-white shadow-sm':'min-h-10 shrink-0 rounded-full border border-[#2e2e36] bg-[#24242b] px-5 text-xs font-bold text-[#c4c4cc] transition hover:border-[#f59e0b] hover:text-[#f59e0b]'}>{c.name_ar}</button>)}
    </div>
    {p.loading?<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1,2,3,4,5,6].map(i=><div key={i} className="h-[270px] animate-pulse rounded-2xl bg-[#202026]"/>)}</div>
    :p.error?<div className="rounded-2xl border border-[#2e2e36] bg-[#202026] p-8 text-center"><p className="font-bold text-[#f4f4f5]">المنيو غير متاح حاليًا</p><p className="mt-2 text-sm text-[#a1a1aa]">{p.error}</p><button onClick={()=>location.reload()} className="mt-4 text-sm font-bold text-[#f59e0b]">إعادة المحاولة</button></div>
    :p.groups.length===0?<div className="py-16 text-center text-sm text-[#a1a1aa]">لا توجد أصناف مطابقة في هذا القسم.</div>
    :<div className="space-y-12">{p.groups.map(group=><section key={group.id}>
      <div className="mb-4 flex items-end justify-between border-b border-[#e5ddd2] pb-3"><div><p className="text-[10px] font-black tracking-[.16em] text-[#fbbf24]">BURGER HOUSE MENU</p><h3 className="mt-1 text-xl font-black text-[#f4f4f5] sm:text-2xl">{group.name_ar}</h3></div><div className="flex items-center gap-3"><button type="button" onClick={p.onToggleFavorites} aria-pressed={p.showFavoritesOnly} className={p.showFavoritesOnly?'rounded-full bg-[#292722] px-3 py-2 text-[10px] font-bold text-white':'rounded-full border border-[#2e2e36] px-3 py-2 text-[10px] font-bold text-[#c4c4cc]'}>{p.showFavoritesOnly?'عرض كل المنتجات':'المفضلة'} ({p.favoriteIds.length})</button><span className="text-[11px] text-[#a1a1aa]">{group.products.length} أصناف</span></div></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{group.products.map(product=><article key={product.id} className="overflow-hidden rounded-2xl border border-[#2e2e36] bg-[#18181c] shadow-[0_12px_30px_rgba(0,0,0,.2)] transition hover:-translate-y-0.5 hover:border-[#8a5b12]">
        <button type="button" onClick={()=>p.onOpenProduct(product)} aria-label={'تخصيص '+product.name_ar} className="relative block aspect-[16/10] w-full overflow-hidden bg-[#202026]"><SafeFoodImage src={product.image_url} categoryId={product.category_id} alt={product.name_ar} loading="lazy" className="h-full w-full object-cover"/>{product.is_featured&&<span className="absolute right-3 top-3 rounded-full border border-white/80 bg-[#202026]/95 px-3 py-1.5 text-[10px] font-black text-[#f59e0b]">اختيار البيت</span>}</button>
        <div className="p-4"><div className="mb-2 flex justify-end"><button type="button" onClick={()=>p.onToggleFavorite(product.id)} disabled={p.favoriteBusy===product.id} aria-label={p.favoriteIds.includes(product.id)?'إزالة من المفضلة':'إضافة إلى المفضلة'} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#2e2e36] bg-[#24242b] text-[#f59e0b] disabled:opacity-50"><Heart size={17} fill={p.favoriteIds.includes(product.id)?'currentColor':'none'}/></button></div>
          <div className="flex items-start justify-between gap-3"><h4 className="text-base font-black text-[#f4f4f5]">{product.name_ar}</h4><strong className="shrink-0 text-sm font-black text-[#fbbf24]">{money(p.basePrice(product))} <small>ر.س</small></strong></div><p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-[#a1a1aa]">{product.description_ar}</p>
          <div className="mt-4 flex items-center justify-between border-t border-[#2e2e36] pt-3"><span className="flex items-center gap-1.5 text-[11px] text-[#a1a1aa]"><Clock3 size={13}/>{product.prep_minutes||p.activeBranch?.prep_time_minutes||15} دقيقة</span><button type="button" onClick={()=>p.onOpenProduct(product)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#f59e0b] px-4 text-xs font-black text-[#211704] shadow-[0_7px_18px_rgba(245,158,11,.18)] transition hover:bg-[#fbbf24]">خصّص طلبك <Plus size={15}/></button></div>
        </div>
      </article>)}</div>
    </section>)}</div>}
  </section>;
}

export function StorefrontProductSheet(props: {
  product:StorefrontProduct|null; sizes:StorefrontSize[]; addons:StorefrontAddon[]; selectedSize:string;
  selectedAddons:string[]; quantity:number; note:string; basePrice:number; addonPrice:number;
  onClose:()=>void; onSize:(id:string)=>void; onAddons:(ids:string[])=>void; onQuantity:(n:number)=>void;
  onNote:(value:string)=>void; onAdd:()=>void;
}) {
  const p=props; if(!p.product)return null; const product=p.product;
  const choices=p.addons.filter(a=>product.allowed_addon_ids?.includes(a.id));
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#211c17]/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" onClick={p.onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="bh-product-title" className="relative max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border border-[#2e2e36] bg-[#18181c] text-[#f4f4f5] shadow-[0_28px_75px_rgba(38,30,22,.24)] sm:max-h-[90vh] sm:rounded-3xl" onClick={e=>e.stopPropagation()}>
      <button type="button" onClick={p.onClose} aria-label="إغلاق تفاصيل المنتج" className="absolute left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-[#292722]/80 text-white"><X size={19}/></button>
      <div className="grid md:grid-cols-[.95fr_1.05fr]">
        <div className="relative h-52 overflow-hidden bg-[#202026] sm:h-72"><SafeFoodImage src={product.image_url} categoryId={product.category_id} alt={product.name_ar} className="h-full w-full object-cover"/><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-5 pt-12 text-[10px] font-black tracking-[.18em] text-white">BURGER HOUSE · FRESHLY MADE</div></div>
        <div className="flex flex-col p-5 sm:p-7"><div className="flex items-start justify-between gap-4 border-b border-[#2e2e36] pb-5"><div><span className="text-[10px] font-black tracking-[.16em] text-[#fbbf24]">تفاصيل الصنف</span><h2 id="bh-product-title" className="mt-2 text-2xl font-black">{product.name_ar}</h2><p className="mt-2 text-sm leading-7 text-[#a1a1aa]">{product.description_ar}</p></div><div className="shrink-0 rounded-xl bg-[#24242b] px-3 py-2 text-center"><span className="block text-[10px] text-[#a1a1aa]">السعر</span><b className="mt-1 block text-lg text-[#f59e0b]">{money(p.basePrice)} </b><span className="text-[10px]">ر.س</span></div></div>
          {!!product.sizes?.length&&<section className="mt-5 rounded-2xl border border-[#2e2e36] bg-[#202026] p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black">اختر {product.category_id==='cat-drinks'?'حجم المشروب':product.category_id==='cat-sides'?'حجم الحصة':'حجم البرجر'}</h3><span className="text-[10px] text-[#a1a1aa]">اختيار واحد</span></div><div className="grid grid-cols-2 gap-2">{product.sizes.map(size=><label key={size.id} className={p.selectedSize===size.id?'flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-[#f59e0b] bg-[rgba(245,158,11,.10)] p-3 text-xs font-bold':'flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-[#2e2e36] bg-[#202026] p-3 text-xs font-bold'}><span>{size.name_ar}</span><span className="shrink-0 text-[#f59e0b]">{size.price_delta>0?'+':''}{money(Number(size.price_delta))} ر.س</span><input type="radio" className="sr-only" checked={p.selectedSize===size.id} onChange={()=>p.onSize(size.id)}/></label>)}</div></section>}
          {!!choices.length&&<section className="mt-4 rounded-2xl border border-[#2e2e36] bg-[#202026] p-4"><div className="mb-3"><h3 className="text-sm font-black">خلّها على ذوقك</h3><p className="mt-1 text-[11px] text-[#a1a1aa]">إضافات اختيارية لوجبتك</p></div><div className="grid gap-2 sm:grid-cols-2">{choices.map(addon=><label key={addon.id} className={p.selectedAddons.includes(addon.id)?'flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#f59e0b] bg-[rgba(245,158,11,.10)] px-3 py-3':'flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#2e2e36] bg-[#202026] px-3 py-3'}><span className="flex items-center gap-3"><input type="checkbox" checked={p.selectedAddons.includes(addon.id)} onChange={e=>p.onAddons(e.target.checked?[...p.selectedAddons,addon.id]:p.selectedAddons.filter(id=>id!==addon.id))} className="h-4 w-4 accent-[#d84b35]"/><span className="text-xs font-bold">{addon.name_ar}</span></span><b className="rounded-lg bg-[#24242b] px-2 py-1 text-[11px] text-[#f59e0b]">+{money(Number(addon.price))}</b></label>)}</div></section>}
          <label className="mt-4 block text-xs font-bold">ملاحظات خاصة <span className="font-normal text-[#a1a1aa]">(اختياري)</span><input value={p.note} onChange={e=>p.onNote(e.target.value)} placeholder="مثلاً: بدون مخلل أو الصوص على الجانب" className="mt-2 min-h-12 w-full rounded-xl border border-[#2e2e36] bg-[#202026] px-4 py-3 text-sm outline-none focus:border-[#f59e0b]"/></label>
          <div className="mt-5 flex items-center gap-3 border-t border-[#2e2e36] pt-5"><div className="flex h-12 shrink-0 items-center gap-4 rounded-xl border border-[#2e2e36] bg-[#24242b] px-3"><button type="button" aria-label="تقليل الكمية" onClick={()=>p.onQuantity(Math.max(1,p.quantity-1))}><Minus size={15}/></button><b className="min-w-4 text-center text-sm">{p.quantity}</b><button type="button" aria-label="زيادة الكمية" onClick={()=>p.onQuantity(Math.min(20,p.quantity+1))}><Plus size={15}/></button></div><button type="button" onClick={p.onAdd} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#f59e0b] px-4 text-sm font-black text-[#211704] shadow-[0_9px_22px_rgba(245,158,11,.18)] transition hover:bg-[#fbbf24]">أضف للسلة · {money((p.basePrice+p.addonPrice)*p.quantity)} ر.س</button></div>
        </div>
      </div>
    </section>
  </div>;
}

export function StorefrontCartDrawer(props: {
  open:boolean; cart:StorefrontCartLine[]; count:number; subtotal:number; vat:number; total:number;
  suggested:StorefrontProduct[]; suggestedPrice:(product:StorefrontProduct)=>number; linePrice:(line:StorefrontCartLine)=>number; addonName:(id:string)=>string|undefined;
  onClose:()=>void; onQuantity:(key:string,delta:number)=>void; onCheckout:()=>void;
  onOpenSuggested:(product:StorefrontProduct)=>void;
}) {
  const p=props;if(!p.open)return null;
  return <div className="fixed inset-0 z-[80] bg-[#211c17]/55 backdrop-blur-sm" onClick={p.onClose}><aside role="dialog" aria-modal="true" aria-label="سلة طلبك" className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-[#2e2e36] bg-[#18181c] text-[#f4f4f5] shadow-[-18px_0_60px_rgba(30,24,18,.16)]" onClick={e=>e.stopPropagation()}>
    <div className="flex items-center justify-between border-b border-[#2e2e36] bg-[#202026] px-5 py-5"><div><span className="text-[10px] font-black tracking-[.18em] text-[#fbbf24]">YOUR ORDER</span><div className="mt-1 text-xl font-black">سلة طلبك <span className="mr-1 text-sm font-semibold text-[#a1a1aa]">({p.count})</span></div></div><button type="button" onClick={p.onClose} aria-label="إغلاق السلة" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#24242b]"><X/></button></div>
    <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">{p.cart.length===0?<div className="flex h-full flex-col items-center justify-center py-16 text-center"><ShoppingBag size={34} className="text-[#fbbf24]"/><h3 className="mt-5 text-lg font-black">سلتك تنتظر اختيارك</h3><p className="mt-2 text-sm text-[#a1a1aa]">أضف وجبتك المفضلة ونجهزها لك طازجة.</p></div>:<>
      {p.cart.map(line=><article key={line.key} className="bh-cart-line-card flex gap-3 rounded-2xl border border-[#2e2e36] bg-[#202026] p-3"><SafeFoodImage src={line.product.image_url} categoryId={line.product.category_id} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover"/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><b className="text-xs leading-5">{line.product.name_ar}</b><strong className="shrink-0 text-xs text-[#f59e0b]">{money(p.linePrice(line))} ر.س</strong></div>{line.size?.name_ar&&<p className="mt-1 text-[11px] text-[#a1a1aa]">{line.size.name_ar}</p>}{line.addonIds.length>0&&<p className="mt-1 text-[10px] text-[#a1a1aa]">{line.addonIds.map(p.addonName).filter(Boolean).join('، ')}</p>}{line.note&&<p className="mt-1 line-clamp-2 text-[10px] text-[#a1a1aa]">ملاحظة: {line.note}</p>}<div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-[#a1a1aa]">الكمية</span><div className="flex h-8 items-center gap-3 rounded-lg bg-[#24242b] px-2"><button type="button" aria-label="تقليل الكمية" onClick={()=>p.onQuantity(line.key,-1)}><Minus size={13}/></button><span className="min-w-3 text-center text-xs font-bold">{line.quantity}</span><button type="button" aria-label="زيادة الكمية" onClick={()=>p.onQuantity(line.key,1)}><Plus size={13}/></button></div></div></div></article>)}
      {p.suggested.length>0&&<section className="pt-3"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black">أكمل وجبتك</h3><span className="text-[10px] text-[#a1a1aa]">اقتراحات من المنيو</span></div><div className="flex gap-3 overflow-x-auto pb-2">{p.suggested.map(product=><article key={product.id} className="bh-cart-upsell-card w-36 shrink-0 overflow-hidden rounded-xl border border-[#2e2e36] bg-[#202026]"><SafeFoodImage src={product.image_url} categoryId={product.category_id} alt={product.name_ar} className="h-20 w-full object-cover"/><div className="p-2"><p className="line-clamp-1 text-[11px] font-bold">{product.name_ar}</p><p className="mt-1 text-[10px] text-[#f59e0b]">{money(p.suggestedPrice(product))} ر.س</p><button type="button" onClick={()=>p.onOpenSuggested(product)} className="mt-2 min-h-8 w-full rounded-lg bg-[#24242b] text-[10px] font-black text-[#f59e0b]">تخصيص وإضافة</button></div></article>)}</div></section>}
    </>}</div>
    {p.cart.length>0&&<div className="bh-cart-summary-panel border-t border-[#2e2e36] bg-[#18181c] p-5 shadow-[0_-8px_24px_rgba(0,0,0,.22)] sm:p-6"><div className="space-y-2 text-xs text-[#a1a1aa]"><div className="flex justify-between"><span>المجموع</span><span>{money(p.subtotal)} ر.س</span></div><div className="flex justify-between"><span>ضريبة القيمة المضافة</span><span>{money(p.vat)} ر.س</span></div></div><div className="mt-4 flex items-end justify-between border-t border-[#2e2e36] pt-4"><span className="text-sm font-bold">الإجمالي شامل الضريبة</span><strong className="text-2xl font-black text-[#f59e0b]">{money(p.total)} <small className="text-xs">ر.س</small></strong></div><button type="button" onClick={p.onCheckout} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f59e0b] py-4 text-sm font-black text-[#211704]">متابعة وإتمام الطلب</button><p className="mt-3 text-center text-[10px] text-[#a1a1aa]">استلام من الفرع · الدفع عند الاستلام</p></div>}
  </aside></div>;
}
