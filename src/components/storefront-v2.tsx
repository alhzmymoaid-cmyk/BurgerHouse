'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Check, ChevronDown, Clock3, MapPin, Minus, Plus, Search,
  ShoppingBag, X, Navigation, Phone, PackageCheck, Flame, Menu, ShieldCheck
} from 'lucide-react';

type Size = { id: string; name_ar: string; price_delta: number; is_default?: boolean };
type Addon = { id: string; name_ar: string; price: number; max_per_item?: number };
type Product = {
  id: string; category_id: string; name_ar: string; name_en?: string;
  description_ar: string; base_price: number; image_url: string;
  is_featured?: boolean; prep_minutes?: number; sizes?: Size[]; allowed_addon_ids?: string[];
};
type Branch = {
  id: string; name_ar: string; address_ar: string; phone?: string;
  open_time?: string; close_time?: string; is_active?: boolean;
  is_accepting_orders?: boolean; prep_time_minutes?: number; map_url?: string;
};
type Category = { id: string; name_ar: string; sort_order?: number };
type Payment = { id: string; name_ar: string; description_ar?: string };
type CartLine = { key: string; product: Product; size?: Size; addonIds: string[]; quantity: number; note: string };

const STATUS_LABELS: Record<string,string> = {
  new: 'بانتظار موافقة الفرع', pending_confirmation: 'بانتظار تأكيد الفرع',
  accepted: 'تم قبول طلبك', preparing: 'طلبك قيد التجهيز',
  ready_for_pickup: 'طلبك جاهز للاستلام', completed: 'تم استلام طلبك',
  rejected: 'تم رفض الطلب', cancelled: 'تم إلغاء الطلب'
};
const money = (value: number) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(value);
const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('966')) return '+' + digits;
  if (digits.startsWith('05')) return '+966' + digits.slice(1);
  if (digits.startsWith('5')) return '+966' + digits;
  return value;
};

export default function StorefrontV2() {
  const [catalog, setCatalog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [itemNote, setItemNote] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [orderError, setOrderError] = useState('');
  const [trackCode, setTrackCode] = useState('');
  const [trackToken, setTrackToken] = useState('');
  const [tracking, setTracking] = useState<any>(null);
  const [trackingError, setTrackingError] = useState('');
  const [activePanel, setActivePanel] = useState<'menu'|'branches'|'track'>('menu');
  const [captcha, setCaptcha] = useState<any>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('bh_customer_details');
      if (saved) {
        const details = JSON.parse(saved);
        if (typeof details.name === 'string') setCustomerName(details.name);
        if (typeof details.phone === 'string') setCustomerPhone(details.phone);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('bh_customer_details', JSON.stringify({ name: customerName, phone: customerPhone })); }
    catch {}
  }, [customerName, customerPhone]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/catalog', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('تعذر تحميل القائمة حالياً');
        return response.json();
      })
      .then((data) => {
        if (!mounted) return;
        setCatalog(data);
        const firstBranch = (data.branches || []).find((b: Branch) => b.is_active && b.is_accepting_orders) || data.branches?.find((b: Branch) => b.is_active);
        setBranchId(firstBranch?.id || '');
        setPaymentId(data.payment_methods?.[0]?.id || '');
      })
      .catch((error) => mounted && setCatalogError(error.message || 'تعذر الاتصال بالخادم'))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const products: Product[] = catalog?.products || [];
  const categories: Category[] = catalog?.categories || [];
  const branches: Branch[] = catalog?.branches || [];
  const addons: Addon[] = catalog?.addons || [];
  const payments: Payment[] = catalog?.payment_methods || [];
  const activeBranch = branches.find((branch) => branch.id === branchId);
  const availableProducts = useMemo(() => products.filter((product) => {
    const override = catalog?.branch_overrides?.find((entry: any) => entry.branch_id === branchId && entry.product_id === product.id);
    const matchesCategory = activeCategory === 'all' || product.category_id === activeCategory;
    const matchesSearch = !search || product.name_ar.toLowerCase().includes(search.toLowerCase()) || product.description_ar?.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch && override?.is_available !== false;
  }), [products, activeCategory, search, catalog, branchId]);

  const addonFor = (id: string) => addons.find((addon) => addon.id === id);
  const branchPrice = (product: Product) => Number(catalog?.branch_overrides?.find((entry: any) => entry.branch_id === branchId && entry.product_id === product.id)?.custom_base_price ?? product.base_price);
  const linePrice = (line: CartLine) => (branchPrice(line.product) + Number(line.size?.price_delta || 0) + line.addonIds.reduce((sum,id)=>sum+Number(addonFor(id)?.price||0),0)) * line.quantity;
  const subtotal = cart.reduce((sum,line)=>sum+linePrice(line),0);
  const vat = Number(((subtotal * Number(catalog?.settings?.vat_percentage ?? 15))/100).toFixed(2));
  const total = subtotal + vat;
  const cartCount = cart.reduce((sum,line)=>sum+line.quantity,0);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setSelectedSize(product.sizes?.find((size)=>size.is_default)?.id || product.sizes?.[0]?.id || '');
    setSelectedAddons([]);
    setQuantity(1);
    setItemNote('');
  };

  const addToCart = () => {
    if (!selectedProduct) return;
    const size = selectedProduct.sizes?.find((entry)=>entry.id===selectedSize);
    const note = itemNote.trim() || (selectedProduct.category_id==='cat-meals' ? selectedProduct.description_ar : '');
    const key = [selectedProduct.id,selectedSize,...[...selectedAddons].sort(),note].join(':');
    setCart((current)=>{
      const existing=current.find((line)=>line.key===key);
      if(existing) return current.map((line)=>line.key===key?{...line,quantity:line.quantity+quantity}:line);
      return [...current,{key,product:selectedProduct,size,addonIds:[...selectedAddons],quantity,note}];
    });
    setSelectedProduct(null);
    setCartOpen(true);
  };

  const updateQuantity = (key: string, delta: number) => setCart((current)=>current.map((line)=>line.key===key?{...line,quantity:line.quantity+delta}:line).filter((line)=>line.quantity>0));

  const sendOrder = async (withCaptcha = false) => {
    setOrderError('');
    if (!customerName.trim() || normalizePhone(customerPhone).length !== 13 || !branchId || !paymentId) {
      setOrderError('أكمل الاسم ورقم الجوال واختر فرع الاستلام وطريقة الدفع.');
      return;
    }
    setSubmitting(true);
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'bh-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const payload: any = {
        branch_id: branchId, customer_name: customerName.trim(),
        customer_phone: normalizePhone(customerPhone), customer_notes: customerNotes.trim(),
        payment_method_id: paymentId,
        items: cart.map((line)=>({product_id:line.product.id,size_id:line.size?.id||null,addon_ids:line.addonIds,quantity:line.quantity,item_notes:line.note})),
        client_claimed_total: Number(total.toFixed(2))
      };
      if (withCaptcha && captcha) {
        payload.require_captcha_verification = true;
        payload.captcha_token = captcha.token;
        payload.captcha_answer = captchaAnswer;
      }
      const response = await fetch('/api/orders', {
        method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
        body:JSON.stringify(payload)
      });
      const result = await response.json();
      if (response.status===428 && result.challenge) {
        setCaptcha(result.challenge);
        setOrderError('أكمل خطوة التحقق الأمني ثم أعد إرسال الطلب.');
        return;
      }
      if(!response.ok) throw new Error(result.message_ar||result.message||result.error||'تعذر إرسال الطلب');
      setOrderResult(result);
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
      setCaptcha(null);
      setCaptchaAnswer('');
      setTrackCode(result.order_code||'');
      setTrackToken(result.tracking_token||'');
    } catch(error:any) {
      setOrderError(error.message||'حدث خطأ أثناء إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  const trackOrder = useCallback(async () => {
    setTrackingError('');
    try {
      const response=await fetch('/api/orders/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_code:trackCode.trim(),tracking_token:trackToken.trim()}),cache:'no-store'});
      const result=await response.json();
      if(!response.ok) throw new Error(result.message_ar||'لم نتمكن من العثور على الطلب');
      setTracking(result);
    } catch(error:any) { setTrackingError(error.message||'تعذر تتبع الطلب'); }
  },[trackCode,trackToken]);

  useEffect(() => {
    if(activePanel!=='track'||!trackCode||!trackToken) return;
    let active=true;
    const refresh=async()=>{
      try{
        const response=await fetch('/api/orders/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_code:trackCode.trim(),tracking_token:trackToken.trim()}),cache:'no-store'});
        const result=await response.json();
        if(active&&response.ok) setTracking(result);
      }catch{}
    };
    refresh();
    const timer=window.setInterval(refresh,10000);
    return()=>{active=false;window.clearInterval(timer);};
  },[activePanel,trackCode,trackToken]);

  const detectNearestBranch = () => {
    if(!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async({coords})=>{
      const response=await fetch('/api/branches/nearest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:coords.latitude,longitude:coords.longitude})}).catch(()=>null);
      if(!response?.ok) return;
      const result=await response.json();
      if(result.recommended_branch?.id) setBranchId(result.recommended_branch.id);
    },()=>undefined,{enableHighAccuracy:false,timeout:8000});
  };

  return (
    <main dir="rtl" className="min-h-screen bg-[#f5f3ee] text-[#191b18]">
      <div className="bg-[#20231f] px-4 py-2 text-center text-[11px] font-semibold text-[#f4eee4]">
        تحضير طازج عند الطلب <span className="mx-2 text-[#e47c48]">•</span> استلام مباشر من فروعنا
      </div>
      <header className="sticky top-0 z-40 border-b border-[#e6e2d9] bg-[#fbfaf7]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1400px] items-center justify-between px-4 sm:px-7">
          <button onClick={()=>{setActivePanel('menu');window.scrollTo({top:0,behavior:'smooth'});}} className="flex items-center gap-3 text-right">
            <span className="flex h-11 w-11 items-center justify-center bg-[#20231f] text-sm font-black tracking-widest text-white">BH</span>
            <span><span className="block text-[16px] font-black tracking-[.11em]">BURGER HOUSE</span><span className="mt-0.5 block text-[9px] font-bold tracking-[.2em] text-[#858176]">CRAFTED FOR CRAVINGS</span></span>
          </button>
          <nav className="hidden items-center gap-9 text-[13px] font-bold text-[#5e5e56] md:flex">
            <button onClick={()=>setActivePanel('menu')} className={activePanel==='menu'?'text-[#c65c34]':'hover:text-[#c65c34]'}>المنيو</button>
            <button onClick={()=>setActivePanel('branches')} className={activePanel==='branches'?'text-[#c65c34]':'hover:text-[#c65c34]'}>الفروع</button>
            <button onClick={()=>setActivePanel('track')} className={activePanel==='track'?'text-[#c65c34]':'hover:text-[#c65c34]'}>تتبع الطلب</button>
          </nav>
          <div className="flex items-center gap-2">
            <a href="/auth/login" className="hidden px-3 py-2 text-[11px] font-bold text-[#5e5e56] hover:text-[#c65c34] sm:block">بوابة الموظفين</a>
            <button onClick={()=>setCartOpen(true)} className="relative flex h-11 items-center gap-2 bg-[#c65c34] px-4 text-xs font-black text-white transition hover:bg-[#a94828]">
              <ShoppingBag size={16}/> <span className="hidden sm:inline">سلة الطلب</span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1">{cartCount}</span>
            </button>
            <button onClick={()=>setMobileNav(!mobileNav)} className="border border-[#dedbd2] p-2 md:hidden" aria-label="القائمة"><Menu size={19}/></button>
          </div>
        </div>
        {mobileNav&&<div className="border-t border-[#e6e2d9] bg-white px-5 py-4 md:hidden"><div className="flex justify-around text-sm font-bold"><button onClick={()=>{setActivePanel('menu');setMobileNav(false);}}>المنيو</button><button onClick={()=>{setActivePanel('branches');setMobileNav(false);}}>الفروع</button><button onClick={()=>{setActivePanel('track');setMobileNav(false);}}>تتبع الطلب</button></div></div>}
      </header>

      {activePanel==='menu'&&<>
        <section className="relative isolate overflow-hidden bg-[#20231f] text-white">
          <div className="absolute inset-0 -z-20"><img src="/images/hero-wagyu-smash.jpg" alt="" className="h-full w-full object-cover object-center opacity-55"/></div>
          <div className="absolute inset-0 -z-10 bg-gradient-to-l from-[#171a17]/95 via-[#171a17]/70 to-[#171a17]/15"/>
          <div className="mx-auto flex min-h-[410px] max-w-[1400px] items-center px-5 py-14 sm:min-h-[490px] sm:px-10 lg:px-16">
            <div className="max-w-[650px]">
              <div className="mb-6 flex items-center gap-3 text-[10px] font-black tracking-[.24em] text-[#f0a078]"><span className="h-px w-9 bg-[#f0a078]"/> BURGER HOUSE · MADE FRESH</div>
              <h1 className="text-[42px] font-black leading-[1.25] sm:text-6xl lg:text-[70px]">الطعم يبدأ<br/><span className="text-[#f1a078]">من أول قضمة.</span></h1>
              <p className="mt-6 max-w-lg text-sm leading-8 text-white/75 sm:text-base">برجر يُحضّر عند الطلب، مكونات مختارة، وتفاصيل تضبط كل لقمة. اختر وجبتك واستلمها ساخنة من الفرع.</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button onClick={()=>document.getElementById('menu-list')?.scrollIntoView({behavior:'smooth'})} className="flex items-center gap-3 bg-[#c65c34] px-7 py-4 text-sm font-black text-white transition hover:bg-[#ad4d2b]">ابدأ طلبك <ArrowLeft size={17}/></button>
                <span className="flex items-center gap-2 text-xs font-semibold text-white/70"><Flame size={15} className="text-[#f1a078}"/> تحضير طازج بعد الطلب</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[#e8e3da] bg-white">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div><div className="text-[10px] font-black tracking-widest text-[#c65c34]">PICKUP LOCATION</div><div className="mt-1 text-sm font-black">من أي فرع تحب تستلم؟</div></div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-[260px]"><MapPin size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#89877e]"/><select value={branchId} onChange={(e)=>setBranchId(e.target.value)} className="h-12 w-full appearance-none border border-[#dfddd5] bg-[#fbfaf7] py-2 pr-10 pl-10 text-xs font-bold outline-none focus:border-[#c65c34]">{branches.filter((b)=>b.is_active).map((b)=><option key={b.id} value={b.id}>{b.name_ar}{b.is_accepting_orders?'':' — لا يستقبل طلبات'}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#89877e]"/></div>
              <button onClick={detectNearestBranch} className="flex h-12 items-center justify-center gap-2 border border-[#dfddd5] px-5 text-xs font-bold text-[#55574f] hover:border-[#c65c34] hover:text-[#c65c34]"><Navigation size={15}/> أقرب فرع لي</button>
            </div>
          </div>
        </section>

        <section id="menu-list" className="mx-auto max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-8 lg:py-16">
          <div className="flex flex-col gap-5 border-b border-[#e4e0d7] pb-7 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="text-[10px] font-black tracking-[.25em] text-[#c65c34]">THE MENU</div><h2 className="mt-2 text-3xl font-black sm:text-4xl">قائمة برجر هاوس</h2><p className="mt-2 text-sm text-[#77776e]">كل اختياراتنا في قائمة واحدة. اختر القسم ثم خصّص طلبك.</p></div>
            <div className="relative w-full lg:max-w-[340px]"><Search size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8b897f]"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="ابحث عن صنف..." className="h-12 w-full border border-[#dfddd5] bg-white pr-11 pl-4 text-sm outline-none focus:border-[#c65c34]"/></div>
          </div>
          <div className="sticky top-[76px] z-20 -mx-4 mt-6 border-b border-[#e9e5dd] bg-[#f5f3ee]/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button onClick={()=>setActiveCategory('all')} className={activeCategory==='all'?'shrink-0 bg-[#20231f] px-5 py-3 text-xs font-black text-white':'shrink-0 border border-[#dedbd2] bg-white px-5 py-3 text-xs font-bold text-[#5f6058] hover:border-[#c65c34]'}>كل الأصناف</button>
              {categories.map((category)=><button key={category.id} onClick={()=>setActiveCategory(category.id)} className={activeCategory===category.id?'shrink-0 bg-[#20231f] px-5 py-3 text-xs font-black text-white':'shrink-0 border border-[#dedbd2] bg-white px-5 py-3 text-xs font-bold text-[#5f6058] hover:border-[#c65c34]'}>{category.name_ar}</button>)}
            </div>
          </div>

          {loading?<div className="grid gap-5 pt-8 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map((n)=><div key={n} className="h-[360px] animate-pulse bg-[#e8e5de]"/>)}</div>
          :catalogError?<div className="mt-8 border border-red-200 bg-white p-8 text-center"><p className="font-bold">تعذر تحميل القائمة</p><p className="mt-2 text-sm text-[#77776e]">{catalogError}</p><button onClick={()=>location.reload()} className="mt-4 text-sm font-black text-[#c65c34]">إعادة المحاولة</button></div>
          :availableProducts.length===0?<div className="py-20 text-center text-sm text-[#77776e]">لا توجد أصناف في هذا القسم حالياً.</div>
          :<div className="grid gap-x-5 gap-y-8 pt-8 sm:grid-cols-2 lg:grid-cols-3">
            {availableProducts.map((product)=>{
              const price=branchPrice(product);
              return <article key={product.id} className="group overflow-hidden border border-[#e6e2d9] bg-white transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(32,35,31,.09)]">
                <button onClick={()=>openProduct(product)} className="relative block aspect-[5/3] w-full overflow-hidden bg-[#e8e5de] text-right">
                  <img src={product.image_url||'/images/hero-wagyu-smash.jpg'} alt={product.name_ar} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"/>
                  {product.is_featured&&<span className="absolute right-4 top-4 bg-white px-3 py-1.5 text-[10px] font-black text-[#b94f2d]">اختيار البيت</span>}
                  <span className="absolute bottom-4 left-4 flex h-10 w-10 items-center justify-center bg-white text-[#20231f] shadow-sm transition group-hover:bg-[#c65c34] group-hover:text-white"><Plus size={18}/></span>
                </button>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="text-lg font-black leading-7">{product.name_ar}</h3><p className="mt-1 line-clamp-2 min-h-[44px] text-xs leading-6 text-[#77776e]">{product.description_ar}</p></div><div className="shrink-0 pt-1 text-sm font-black text-[#c65c34]">{money(price)}<span className="mr-1 text-[10px]">ر.س</span></div></div>
                  <div className="mt-5 flex items-center justify-between border-t border-[#eeebe4] pt-4"><span className="flex items-center gap-1.5 text-[10px] text-[#828278]"><Clock3 size={13}/>{product.prep_minutes||activeBranch?.prep_time_minutes||15} دقيقة</span><button onClick={()=>openProduct(product)} className="flex items-center gap-2 text-xs font-black text-[#20231f] hover:text-[#c65c34]">تخصيص وإضافة <ArrowLeft size={14}/></button></div>
                </div>
              </article>;
            })}
          </div>}
        </section>
      </>}

      {activePanel==='branches'&&<section className="mx-auto min-h-[65vh] max-w-[1200px] px-4 py-14 sm:px-8">
        <div className="text-[10px] font-black tracking-[.24em] text-[#c65c34]">OUR LOCATIONS</div><h1 className="mt-2 text-4xl font-black">فروعنا</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[#77776e]">اختر الفرع الذي يناسبك لاستلام طلبك. حالة استقبال الطلبات وساعات العمل تظهر بوضوح لكل فرع.</p>
        <div className="mt-9 grid gap-5 md:grid-cols-2">{branches.filter((b)=>b.is_active).map((branch)=><article key={branch.id} className="border border-[#e3dfd6] bg-white p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">{branch.name_ar}</h2><p className="mt-2 text-sm leading-7 text-[#77776e]">{branch.address_ar}</p></div><span className={branch.is_accepting_orders?'bg-[#e8f1e8] px-3 py-1.5 text-[10px] font-black text-[#3f7046]':'bg-[#f2eee8] px-3 py-1.5 text-[10px] font-black text-[#8b6c50]'}>{branch.is_accepting_orders?'يستقبل الطلبات':'متوقف مؤقتاً'}</span></div>
          <div className="mt-5 flex flex-wrap gap-5 border-t border-[#eeebe4] pt-4 text-xs text-[#696a62]"><span className="flex items-center gap-2"><Clock3 size={14}/>{branch.open_time} – {branch.close_time}</span><span className="flex items-center gap-2"><Phone size={14}/>{branch.phone||'—'}</span></div>
          <div className="mt-5 flex gap-2"><button disabled={!branch.is_accepting_orders} onClick={()=>{setBranchId(branch.id);setActivePanel('menu');window.scrollTo({top:0,behavior:'smooth'});}} className="bg-[#20231f] px-5 py-3 text-xs font-black text-white disabled:opacity-40">اختيار هذا الفرع</button>{branch.map_url&&<a href={branch.map_url} target="_blank" rel="noreferrer" className="border border-[#dedbd2] px-5 py-3 text-xs font-bold">الاتجاهات</a>}</div>
        </article>)}</div>
      </section>}

      {activePanel==='track'&&<section className="mx-auto min-h-[65vh] max-w-3xl px-4 py-16 sm:px-8">
        <div className="text-center"><PackageCheck size={34} className="mx-auto text-[#c65c34]"/><div className="mt-4 text-[10px] font-black tracking-[.24em] text-[#c65c34]">ORDER TRACKING</div><h1 className="mt-2 text-3xl font-black">تتبع طلبك</h1><p className="mt-3 text-sm text-[#77776e]">أدخل رقم الطلب ورمز التتبع الموجودين في رسالة تأكيد الطلب.</p></div>
        <div className="mt-8 border border-[#e3dfd6] bg-white p-6 sm:p-8">
          <label className="block text-xs font-black">رقم الطلب<input value={trackCode} onChange={(e)=>setTrackCode(e.target.value)} placeholder="BH-XXXX-XXXX" dir="ltr" className="mt-2 h-12 w-full border border-[#dedbd2] bg-[#fbfaf7] px-4 text-sm outline-none focus:border-[#c65c34]"/></label>
          <label className="mt-4 block text-xs font-black">رمز التتبع<input value={trackToken} onChange={(e)=>setTrackToken(e.target.value)} placeholder="trk_..." dir="ltr" className="mt-2 h-12 w-full border border-[#dedbd2] bg-[#fbfaf7] px-4 text-sm outline-none focus:border-[#c65c34]"/></label>
          {trackingError&&<p className="mt-4 text-xs font-bold text-red-700">{trackingError}</p>}
          <button onClick={trackOrder} className="mt-5 w-full bg-[#c65c34] py-4 text-sm font-black text-white">عرض حالة الطلب</button>
          {tracking&&<div className="mt-7 border-t border-[#eeeae2] pt-6"><div className="text-[10px] font-black tracking-widest text-[#c65c34]">LIVE ORDER STATUS</div><div className="mt-2 text-xl font-black">{STATUS_LABELS[tracking.status]||tracking.status_ar||tracking.status||'قيد المعالجة'}</div><div className="mt-5 grid grid-cols-4 gap-2 text-center text-[10px]">{[['new','pending_confirmation','accepted','preparing','ready_for_pickup','completed'],'استلام الطلب'],[['accepted','preparing','ready_for_pickup','completed'],'القبول'],[['preparing','ready_for_pickup','completed'],'التجهيز'],[['ready_for_pickup','completed'],'جاهز للاستلام']].map((step:any,index:number)=><div key={index} className={step[0].includes(tracking.status)?'border-t-2 border-[#c65c34] pt-2 font-black text-[#c65c34]':'border-t-2 border-[#dedbd2] pt-2 text-[#9b998f]'}>{step[1]}</div>)}</div>{tracking.rejected_reason&&<p className="mt-4 bg-red-50 p-3 text-xs text-red-700">سبب الرفض: {tracking.rejected_reason}</p>}</div>}
        </div>
      </section>}

      <footer className="bg-[#20231f] text-[#f3efe7]">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-8"><div><div className="text-lg font-black tracking-widest">BURGER HOUSE</div><p className="mt-2 text-xs text-white/55">برجر طازج. تحضير عند الطلب. استلام من الفرع.</p></div><div className="flex flex-wrap gap-6 text-xs font-bold text-white/70"><button onClick={()=>setActivePanel('menu')}>المنيو</button><button onClick={()=>setActivePanel('branches')}>الفروع</button><button onClick={()=>setActivePanel('track')}>تتبع الطلب</button><a href="/auth/login">دخول الموظفين</a></div></div>
        <div className="border-t border-white/10 py-4 text-center text-[10px] text-white/40">© {new Date().getFullYear()} BURGER HOUSE. جميع الحقوق محفوظة.</div>
      </footer>

      {selectedProduct&&<div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-5" onClick={()=>setSelectedProduct(null)}>
        <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto bg-[#fbfaf7] text-[#20231f] sm:max-h-[88vh]" onClick={(e)=>e.stopPropagation()}>
          <div className="relative aspect-[16/8] bg-[#e7e3db]"><img src={selectedProduct.image_url||'/images/hero-wagyu-smash.jpg'} alt={selectedProduct.name_ar} className="h-full w-full object-cover"/><button onClick={()=>setSelectedProduct(null)} className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center bg-white"><X size={18}/></button></div>
          <div className="p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">{selectedProduct.name_ar}</h2><p className="mt-2 text-sm leading-7 text-[#77776e]">{selectedProduct.description_ar}</p></div><span className="shrink-0 text-lg font-black text-[#c65c34]">{money(branchPrice(selectedProduct)+Number(selectedProduct.sizes?.find((s)=>s.id===selectedSize)?.price_delta||0))} ر.س</span></div>
            {!!selectedProduct.sizes?.length&&<div className="mt-6"><div className="mb-3 text-sm font-black">{selectedProduct.category_id==='cat-drinks'?'اختر حجم المشروب':selectedProduct.category_id==='cat-sides'?'اختر حجم الحصة':'اختر الحجم'}</div><div className="grid gap-2 sm:grid-cols-2">{selectedProduct.sizes.map((size)=><label key={size.id} className={selectedSize===size.id?'flex cursor-pointer items-center justify-between border border-[#c65c34] bg-[#fff0e9] p-3 text-xs font-bold':'flex cursor-pointer items-center justify-between border border-[#e2ded6] bg-white p-3 text-xs font-bold'}><span>{size.name_ar}</span><span>{Number(size.price_delta)>0?'+':''}{money(Number(size.price_delta))} ر.س</span><input type="radio" className="sr-only" checked={selectedSize===size.id} onChange={()=>setSelectedSize(size.id)}/></label>)}</div></div>}
            {!!selectedProduct.allowed_addon_ids?.length&&<div className="mt-6"><div className="mb-3 text-sm font-black">إضافات اختيارية</div><div className="space-y-2">{selectedProduct.allowed_addon_ids.map((id)=>addonFor(id)).filter(Boolean).map((addon)=><label key={addon!.id} className="flex items-center justify-between border border-[#e2ded6] bg-white px-3 py-3 text-xs"><span className="flex items-center gap-3"><input type="checkbox" checked={selectedAddons.includes(addon!.id)} onChange={(e)=>setSelectedAddons((current)=>e.target.checked?[...current,addon!.id]:current.filter((item)=>item!==addon!.id))} className="h-4 w-4 accent-[#c65c34]"/>{addon!.name_ar}</span><b>+{money(Number(addon!.price))} ر.س</b></label>)}</div></div>}
            <label className="mt-5 block text-xs font-black">ملاحظات خاصة<input value={itemNote} onChange={(e)=>setItemNote(e.target.value)} placeholder="مثلاً: بدون مخلل" className="mt-2 h-12 w-full border border-[#dedbd2] bg-white px-3 text-sm outline-none focus:border-[#c65c34]"/></label>
            <div className="mt-6 flex items-center justify-between gap-4"><div className="flex items-center gap-4 border border-[#dedbd2] bg-white px-3 py-2"><button onClick={()=>setQuantity(Math.max(1,quantity-1))}><Minus size={15}/></button><b>{quantity}</b><button onClick={()=>setQuantity(Math.min(20,quantity+1))}><Plus size={15}/></button></div><button onClick={addToCart} className="flex-1 bg-[#c65c34] py-3.5 text-sm font-black text-white">أضف إلى السلة</button></div>
          </div>
        </div>
      </div>}

      {cartOpen&&<div className="fixed inset-0 z-[80] bg-black/55" onClick={()=>setCartOpen(false)}><aside className="absolute left-0 top-0 flex h-full w-full max-w-md flex-col bg-[#fbfaf7] text-[#20231f]" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#e5e1d8] p-5"><div><div className="text-lg font-black">سلة طلبك</div><div className="mt-1 text-xs text-[#77776e]">{cartCount} قطع</div></div><button onClick={()=>setCartOpen(false)} className="p-2"><X/></button></div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">{cart.length===0?<div className="py-16 text-center text-sm text-[#77776e]">السلة فارغة حالياً.</div>:cart.map((line)=><div key={line.key} className="flex gap-3 border-b border-[#e8e4dc] pb-4"><img src={line.product.image_url} alt="" className="h-20 w-24 object-cover"/><div className="min-w-0 flex-1"><div className="text-sm font-black">{line.product.name_ar}</div><div className="mt-1 text-[11px] text-[#77776e]">{line.size?.name_ar}</div>{line.addonIds.map((id)=><div key={id} className="text-[10px] text-[#77776e]">{addonFor(id)?.name_ar}</div>)}{line.note&&<div className="mt-1 text-[10px] text-[#77776e]">{line.note}</div>}<div className="mt-2 flex items-center justify-between"><b className="text-xs">{money(linePrice(line))} ر.س</b><div className="flex items-center gap-3"><button onClick={()=>updateQuantity(line.key,-1)}><Minus size={13}/></button><span className="text-xs font-bold">{line.quantity}</span><button onClick={()=>updateQuantity(line.key,1)}><Plus size={13}/></button></div></div></div></div>)}</div>
        {cart.length>0&&<div className="border-t border-[#e5e1d8] p-5"><div className="flex justify-between text-xs text-[#77776e]"><span>المجموع</span><span>{money(subtotal)} ر.س</span></div><div className="mt-2 flex justify-between text-xs text-[#77776e]"><span>ضريبة القيمة المضافة</span><span>{money(vat)} ر.س</span></div><div className="mt-3 flex justify-between border-t border-[#e5e1d8] pt-3 text-base font-black"><span>الإجمالي</span><span>{money(total)} ر.س</span></div><button onClick={()=>{setCartOpen(false);setCheckoutOpen(true);}} className="mt-5 w-full bg-[#c65c34] py-4 text-sm font-black text-white">متابعة وإتمام الطلب</button><p className="mt-3 text-center text-[10px] text-[#858277]">الاستلام من الفرع فقط — الدفع عند الاستلام</p></div>}
      </aside></div>}

      {checkoutOpen&&<div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={()=>setCheckoutOpen(false)}><div className="max-h-[94vh] w-full max-w-lg overflow-y-auto bg-[#fbfaf7] p-6 text-[#20231f] sm:p-8" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between"><div><div className="text-xl font-black">إتمام الطلب</div><div className="mt-1 text-xs text-[#77776e]">استلام من الفرع والدفع عند الاستلام.</div></div><button onClick={()=>setCheckoutOpen(false)}><X/></button></div>
        <div className="mt-6 space-y-4">
          <label className="block text-xs font-black">الاسم الكامل<input value={customerName} onChange={(e)=>setCustomerName(e.target.value)} className="mt-2 h-12 w-full border border-[#dedbd2] bg-white px-3 text-sm outline-none focus:border-[#c65c34]" placeholder="اسمك"/></label>
          <label className="block text-xs font-black">رقم الجوال<input value={customerPhone} onChange={(e)=>setCustomerPhone(e.target.value)} className="mt-2 h-12 w-full border border-[#dedbd2] bg-white px-3 text-sm outline-none focus:border-[#c65c34]" placeholder="05xxxxxxxx" inputMode="tel" dir="ltr"/></label>
          <label className="block text-xs font-black">فرع الاستلام<select value={branchId} onChange={(e)=>setBranchId(e.target.value)} className="mt-2 h-12 w-full border border-[#dedbd2] bg-white px-3 text-sm outline-none focus:border-[#c65c34]">{branches.filter((b)=>b.is_active).map((b)=><option key={b.id} value={b.id}>{b.name_ar}</option>)}</select></label>
          <label className="block text-xs font-black">طريقة الدفع عند الاستلام<select value={paymentId} onChange={(e)=>setPaymentId(e.target.value)} className="mt-2 h-12 w-full border border-[#dedbd2] bg-white px-3 text-sm outline-none focus:border-[#c65c34]">{payments.map((p)=><option key={p.id} value={p.id}>{p.name_ar}</option>)}</select></label>
          <label className="block text-xs font-black">ملاحظات للفرع<textarea value={customerNotes} onChange={(e)=>setCustomerNotes(e.target.value)} rows={2} className="mt-2 w-full border border-[#dedbd2] bg-white px-3 py-3 text-sm outline-none focus:border-[#c65c34]" placeholder="اختياري"/></label>
          {captcha&&<div className="border border-[#dedbd2] bg-white p-4"><div className="text-xs font-black">تحقق أمني: {captcha.question_ar||captcha.question||'أجب عن سؤال التحقق'}</div><input value={captchaAnswer} onChange={(e)=>setCaptchaAnswer(e.target.value)} className="mt-2 h-11 w-full border border-[#dedbd2] px-3 text-sm" placeholder="الإجابة"/></div>}
          {orderError&&<div className="border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{orderError}</div>}
          <div className="flex justify-between border-t border-[#e5e1d8] pt-4 text-base font-black"><span>الإجمالي شامل الضريبة</span><span>{money(total)} ر.س</span></div>
          <button disabled={submitting} onClick={()=>sendOrder(Boolean(captcha))} className="w-full bg-[#c65c34] py-4 text-sm font-black text-white disabled:opacity-50">{submitting?'جارٍ إرسال الطلب...':'تأكيد الطلب'}</button>
          <p className="text-center text-[10px] leading-5 text-[#858277]">يتم التحقق من الأسعار والتوفر على الخادم قبل اعتماد الطلب.</p>
        </div>
      </div></div>}

      {orderResult&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4"><div className="w-full max-w-md bg-[#fbfaf7] p-8 text-center text-[#20231f]"><div className="mx-auto flex h-14 w-14 items-center justify-center bg-[#e7f1e7] text-[#3f7046]"><Check size={28}/></div><div className="mt-5 text-[10px] font-black tracking-[.2em] text-[#c65c34]">ORDER RECEIVED</div><h2 className="mt-2 text-2xl font-black">وصل طلبك إلى الفرع</h2><p className="mt-2 text-sm leading-7 text-[#77776e]">طلبك الآن بانتظار موافقة الفرع. احتفظ برقم الطلب ورمز التتبع.</p><div className="mt-5 border border-[#e5e1d8] bg-white p-4"><div className="text-xs text-[#77776e]">رقم الطلب</div><div className="mt-1 text-xl font-black" dir="ltr">{orderResult.order_code}</div><div className="mt-4 text-xs text-[#77776e]">رمز التتبع</div><div className="mt-1 break-all text-xs font-bold" dir="ltr">{orderResult.tracking_token}</div></div><button onClick={()=>{setOrderResult(null);setActivePanel('track');}} className="mt-5 w-full bg-[#20231f] py-3.5 text-sm font-black text-white">تتبع الطلب</button><button onClick={()=>setOrderResult(null)} className="mt-3 text-xs font-bold text-[#77776e]">العودة للقائمة</button></div></div>}
    </main>
  );
}
