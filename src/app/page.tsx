'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ArrowLeft, ArrowUpLeft, Check, ChevronDown, Clock3, Flame, MapPin,
  Menu, Minus, Plus, ShoppingBag, X, Search, ArrowRight, Instagram,
  Phone, Navigation, PackageCheck, Utensils, Truck, ShieldCheck
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
type CartLine = {
  key: string; product: Product; size?: Size; addonIds: string[];
  quantity: number; note: string;
};

const ORDER_STATUS_LABELS: Record<string, string> = { new: 'بانتظار موافقة الفرع', pending_confirmation: 'بانتظار تأكيد الفرع', accepted: 'تم قبول طلبك', preparing: 'طلبك قيد التجهيز', ready_for_pickup: 'طلبك جاهز للاستلام', completed: 'تم استلام طلبك', rejected: 'تم رفض الطلب', cancelled: 'تم إلغاء الطلب' };
const money = (value: number) => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(value);
const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('966')) return '+' + digits;
  if (digits.startsWith('05')) return '+966' + digits.slice(1);
  if (digits.startsWith('5')) return '+966' + digits;
  return value;
};

export default function StorefrontPage() {
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
  const [customerDataLoaded, setCustomerDataLoaded] = useState(false);
  const [customerLoggedIn, setCustomerLoggedIn] = useState(false);
  const [customerNotes, setCustomerNotes] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [orderError, setOrderError] = useState('');

  const [activeView, setActiveView] = useState<'menu' | 'branches'>('menu');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [captcha, setCaptcha] = useState<any>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  useEffect(() => {
    let active = true;
    const loadCustomer = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        if (user) {
          setCustomerLoggedIn(true);
          const { data: profile } = await supabase.from('customer_profiles').select('full_name, phone').eq('id', user.id).maybeSingle();
          setCustomerName(profile?.full_name || user.user_metadata?.full_name || '');
          setCustomerPhone(profile?.phone || user.phone || '');
        } else setCustomerLoggedIn(false);
      } catch { if (active) setCustomerLoggedIn(false); }
      finally { if (active) setCustomerDataLoaded(true); }
    };
    loadCustomer();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch('/api/catalog', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('تعذر تحميل المنيو حالياً');
        return response.json();
      })
      .then((data) => {
        if (!mounted) return;
        setCatalog(data);
        const firstBranch = (data.branches || []).find((b: Branch) => b.is_active && b.is_accepting_orders) || data.branches?.[0];
        setBranchId(firstBranch?.id || '');
        const firstPayment = data.payment_methods?.[0];
        setPaymentId(firstPayment?.id || '');
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

  const categoryGroups = useMemo(() => categories
    .map((category) => ({ ...category, products: availableProducts.filter((product) => product.category_id === category.id) }))
    .filter((group) => group.products.length > 0), [categories, availableProducts]);



  const addonFor = (id: string) => addons.find((addon) => addon.id === id);
  const linePrice = (line: CartLine) => {
    const override = catalog?.branch_overrides?.find((entry: any) => entry.branch_id === branchId && entry.product_id === line.product.id);
    const base = Number(override?.custom_base_price ?? line.product.base_price);
    const sizeDelta = Number(line.size?.price_delta || 0);
    const addonTotal = line.addonIds.reduce((sum, id) => sum + Number(addonFor(id)?.price || 0), 0);
    return (base + sizeDelta + addonTotal) * line.quantity;
  };
  const subtotal = cart.reduce((sum, line) => sum + linePrice(line), 0);
  const vat = Number(((subtotal * Number(catalog?.settings?.vat_percentage ?? 15)) / 100).toFixed(2));
  const total = subtotal + vat;
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setSelectedSize(product.sizes?.find((size) => size.is_default)?.id || product.sizes?.[0]?.id || '');
    setSelectedAddons([]);
    setQuantity(1);
    setItemNote('');
  };

  const addToCart = () => {
    if (!selectedProduct) return;
    const size = selectedProduct.sizes?.find((entry) => entry.id === selectedSize);
    const note = itemNote.trim() || (selectedProduct.category_id === 'cat-meals' ? selectedProduct.description_ar : '');
    const key = [selectedProduct.id, selectedSize, ...selectedAddons.sort(), note].join(':');
    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) return current.map((line) => line.key === key ? { ...line, quantity: line.quantity + quantity } : line);
      return [...current, { key, product: selectedProduct, size, addonIds: [...selectedAddons], quantity, note }];
    });
    setSelectedProduct(null);
    setCartOpen(true);
  };

  const updateQuantity = (key: string, delta: number) => setCart((current) => current
    .map((line) => line.key === key ? { ...line, quantity: line.quantity + delta } : line)
    .filter((line) => line.quantity > 0));

  const submitOrder = async () => {
    setOrderError('');
    if (!customerLoggedIn) { setOrderError('سجّل الدخول بحسابك أولاً حتى نحفظ الطلب في سجل طلباتك.'); return; }
    if (!customerName.trim() || normalizePhone(customerPhone).length !== 13 || !branchId || !paymentId) {
      setOrderError('أكمل الاسم ورقم الجوال واختر فرع الاستلام وطريقة الدفع.');
      return;
    }
    setSubmitting(true);
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'bh-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          branch_id: branchId,
          customer_name: customerName.trim(),
          customer_phone: normalizePhone(customerPhone),
          customer_notes: customerNotes.trim(),
          payment_method_id: paymentId,
          items: cart.map((line) => ({
            product_id: line.product.id,
            size_id: line.size?.id || null,
            addon_ids: line.addonIds,
            quantity: line.quantity,
            item_notes: line.note
          })),
          client_claimed_total: Number(total.toFixed(2))
        })
      });
      const result = await response.json();
      if (response.status === 428 && result.challenge) {
        setCaptcha(result.challenge);
        setOrderError('يرجى إكمال التحقق الأمني قبل إرسال الطلب.');
        return;
      }
      if (!response.ok) throw new Error(result.message_ar || result.message || result.error || 'تعذر إرسال الطلب');
      setOrderResult(result);
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);

    } catch (error: any) {
      setOrderError(error.message || 'حدث خطأ أثناء إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyAndSubmit = async () => {
    if (!captcha) return submitOrder();
    // Challenge is deliberately solved through the server-issued token; the UI only forwards the answer.
    setOrderError('');
    setSubmitting(true);
    try {
      const idempotencyKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'bh-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          branch_id: branchId, customer_name: customerName.trim(),
          customer_phone: normalizePhone(customerPhone), customer_notes: customerNotes.trim(),
          payment_method_id: paymentId,
          items: cart.map((line) => ({ product_id: line.product.id, size_id: line.size?.id || null, addon_ids: line.addonIds, quantity: line.quantity, item_notes: line.note })),
          client_claimed_total: Number(total.toFixed(2)),
          require_captcha_verification: true,
          captcha_token: captcha.token,
          captcha_answer: captchaAnswer
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message_ar || result.message || result.error || 'تعذر إرسال الطلب');
      setOrderResult(result); setCart([]); setCaptcha(null); setCaptchaAnswer(''); setCheckoutOpen(false); setCartOpen(false);

    } catch (error: any) {
      setOrderError(error.message || 'تعذر إكمال التحقق');
    } finally { setSubmitting(false); }
  };



  const detectNearestBranch = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const response = await fetch('/api/branches/nearest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude })
      }).catch(() => null);
      if (!response?.ok) return;
      const result = await response.json();
      if (result.recommended_branch?.id) setBranchId(result.recommended_branch.id);
    }, () => undefined, { enableHighAccuracy: false, timeout: 8000 });
  };

  return (
    <main className="bh-storefront min-h-screen bg-[#f4f1eb] text-[#201e1a]" dir="rtl">
      <div className="bg-[#1c1c18] px-4 py-2 text-center text-[11px] font-semibold tracking-wide text-[#e9e2d5] sm:text-xs">
        تحضير طازج عند الطلب <span className="mx-2 text-[#b77b45]">•</span> استلام مباشر من فروعنا
      </div>

      <header className="sticky top-0 z-40 border-b border-[#e2dbcf] bg-[#fbf9f4]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <img src="/brand-mark.svg" alt="شعار برجر هاوس" className="h-12 w-12 object-contain"/>
            <div>
              <div className="font-[Cairo] text-[17px] font-black tracking-[.12em]">BURGER HOUSE</div>
              <div className="mt-0.5 text-[10px] font-bold tracking-[.18em] text-[#82796d]">CRAFTED OVER FIRE</div>
            </div>
          </a>

          <nav className="hidden items-center gap-8 text-[13px] font-bold text-[#555047] md:flex">
            <button onClick={() => setActiveView('menu')} className={activeView === 'menu' ? 'text-[#a84f32]' : 'hover:text-[#a84f32]'}>المنيو</button>
            <button onClick={() => setActiveView('branches')} className={activeView === 'branches' ? 'text-[#a84f32]' : 'hover:text-[#a84f32]'}>فروعنا</button>
            <a href="/account/orders" className="hover:text-[#a84f32]">طلباتي</a>
          </nav>

          <div className="flex items-center gap-2">
            <a href="/account" className="hidden rounded-full border border-[#cfc7ba] px-4 py-2 text-xs font-bold text-[#514b42] transition hover:border-[#a65e36] hover:text-[#a65e36] sm:inline-flex">حسابي</a>
            <button onClick={() => setCartOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#a84f32] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#913f28]">
              <ShoppingBag size={15} /> السلة <span className="rounded-full bg-white/15 px-2 py-0.5">{cartCount}</span>
            </button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="rounded-full border border-[#d8d1c6] p-2 md:hidden" aria-label="فتح القائمة"><Menu size={18}/></button>
          </div>
        </div>
        {mobileMenuOpen && <div className="border-t border-[#ded8cd] bg-[#f8f6f1] px-5 py-3 md:hidden">
          <div className="flex justify-around text-sm font-bold">
            <button onClick={() => {setActiveView('menu');setMobileMenuOpen(false);}}>المنيو</button>
            <button onClick={() => {setActiveView('branches');setMobileMenuOpen(false);}}>فروعنا</button>
            <a href="/account/orders" className="hover:text-[#a84f32]">طلباتي</a>
          </div>
        </div>}
      </header>

      {activeView === 'menu' && <>
        <section className="relative overflow-hidden bg-[#191916] text-[#f7f3eb]">
          <div className="mx-auto grid max-w-[1440px] lg:min-h-[570px] lg:grid-cols-[1fr_1.05fr]">
            <div className="relative z-10 order-2 flex flex-col justify-center px-5 py-12 sm:px-10 lg:order-1 lg:px-16 lg:py-20">
              <div className="mb-6 flex items-center gap-3 text-[11px] font-extrabold tracking-[.22em] text-[#c58a5e]"><span className="h-px w-10 bg-[#c58a5e]"/> BURGER HOUSE · EST. FOR GREAT TASTE</div>
              <h1 className="max-w-xl text-[38px] font-black leading-[1.32] tracking-tight sm:text-5xl lg:text-[64px]">البرجر كما<br/><span className="text-[#d59b6c]">يجب أن يكون.</span></h1>
              <p className="mt-5 max-w-lg text-sm leading-8 text-[#d1c9bb] sm:text-base">لحم يُحمّر على الصاج، خبز بريوش طازج، وصوصات نجهزها لتكمل كل قضمة. اختر من قائمتنا واستلم طلبك من الفرع.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={() => document.getElementById('menu-section')?.scrollIntoView({behavior:'smooth'})} className="inline-flex items-center gap-3 bg-[#a84f32] px-7 py-4 text-sm font-extrabold text-white transition hover:bg-[#913f28]">اطلب الآن <ArrowLeft size={17}/></button>
                <button onClick={() => setActiveView('branches')} className="inline-flex items-center gap-2 border border-white/25 px-6 py-4 text-sm font-bold text-[#f2ece2] transition hover:bg-white/10"><MapPin size={16}/> اعثر على فرع</button>
              </div>
              <div className="mt-10 flex flex-wrap gap-6 border-t border-white/15 pt-6 text-xs text-[#c8c0b4]">
                <div><div className="text-base font-black text-white">طازج</div><div className="mt-1">يُحضّر بعد الطلب</div></div>
                <div><div className="text-base font-black text-white">سنقل أو دبل</div><div className="mt-1">اختر حجم برجرك</div></div>
                <div><div className="text-base font-black text-white">{branches.length} فروع</div><div className="mt-1">استلام من الفرع</div></div>
              </div>
            </div>
            <div className="relative order-1 min-h-[300px] overflow-hidden sm:min-h-[430px] lg:order-2 lg:min-h-full">
              <img src="/images/hero-wagyu-smash.jpg" alt="برجر واغيو من برجر هاوس" className="absolute inset-0 h-full w-full object-cover object-center"/>
              <div className="absolute inset-0 bg-gradient-to-t from-[#191916]/70 via-transparent to-[#191916]/5 lg:bg-gradient-to-l lg:from-[#191916]/30 lg:via-transparent lg:to-transparent"/>
              <div className="absolute bottom-6 right-5 border-r-2 border-[#d59b6c] pr-4 text-white sm:bottom-9 sm:right-9"><div className="text-[10px] font-bold tracking-[.2em] text-[#e6c7aa]">HOUSE SIGNATURE</div><div className="mt-1 text-xl font-black sm:text-2xl">واغيو سماش هاوس</div><div className="mt-1 text-xs text-white/75">ابدأ من ٣٨ ر.س</div></div>
              <div className="absolute left-5 top-5 border border-white/25 bg-black/25 px-4 py-2 text-[10px] font-bold tracking-[.16em] text-white backdrop-blur-sm">MADE TO ORDER</div>
            </div>
          </div>
        </section>

        <section className="border-b border-[#e2dbcf] bg-[#fbf9f4]">
          <div className="mx-auto grid max-w-7xl grid-cols-3 divide-x divide-x-reverse divide-[#e5ded3] px-3 py-5 sm:px-8 sm:py-6">
            <div className="px-2 text-center"><div className="text-xs font-black text-[#29251f] sm:text-sm">مكونات مختارة</div><p className="mt-1 text-[10px] text-[#80776b] sm:text-xs">تفاصيل تصنع الفرق</p></div>
            <div className="px-2 text-center"><div className="text-xs font-black text-[#29251f] sm:text-sm">تحضير عند الطلب</div><p className="mt-1 text-[10px] text-[#80776b] sm:text-xs">من المطبخ مباشرة</p></div>
            <div className="px-2 text-center"><div className="text-xs font-black text-[#29251f] sm:text-sm">استلام من الفرع</div><p className="mt-1 text-[10px] text-[#80776b] sm:text-xs">اختر موقعك المناسب</p></div>
          </div>
        </section>

        <section className="border-b border-[#ded8cd] bg-[#ebe7df]">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
            <div><div className="text-xs font-extrabold text-[#a65e36]">استلام من الفرع</div><div className="mt-1 text-sm font-bold">اختر الفرع الذي يناسبك</div></div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-[240px]">
                <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8175]" size={16}/>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full appearance-none border border-[#d3cbbf] bg-[#f8f6f1] py-3 pr-10 pl-9 text-sm font-bold outline-none focus:border-[#a65e36]">
                  {branches.filter((branch) => branch.is_active).map((branch) => <option key={branch.id} value={branch.id}>{branch.name_ar}{branch.is_accepting_orders ? '' : ' — لا يستقبل طلبات'}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8175]" size={15}/>
              </div>
              <button onClick={detectNearestBranch} className="inline-flex items-center justify-center gap-2 border border-[#c9c0b3] px-4 py-3 text-xs font-bold text-[#514b42] hover:border-[#a65e36]"><Navigation size={14}/> أقرب فرع لي</button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 lg:px-8 lg:py-14">
          <div className="mb-6 flex items-end justify-between gap-4"><div><div className="text-[10px] font-black tracking-[.22em] text-[#a84f32]">EXPLORE THE MENU</div><h2 className="mt-2 text-2xl font-black sm:text-3xl">تصفّح حسب ذوقك</h2></div><button onClick={()=>document.getElementById('menu-section')?.scrollIntoView({behavior:'smooth'})} className="text-xs font-extrabold text-[#a84f32] underline underline-offset-4">كل القائمة</button></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((category) => {
              const categoryImage = products.find((product) => product.category_id === category.id)?.image_url || '/images/hero-wagyu-smash.jpg';
              const count = products.filter((product) => product.category_id === category.id).length;
              return <button key={category.id} onClick={()=>{setActiveCategory(category.id);document.getElementById('menu-section')?.scrollIntoView({behavior:'smooth'});}} className="group relative min-h-[150px] overflow-hidden bg-[#24221d] text-right sm:min-h-[190px]">
                <img src={categoryImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-75 transition duration-500 group-hover:scale-105 group-hover:opacity-90"/>
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent"/>
                <div className="absolute bottom-0 right-0 p-4 text-white"><div className="text-sm font-black sm:text-base">{category.name_ar}</div><div className="mt-1 text-[10px] text-white/75">{count} أصناف <span className="mr-1">←</span></div></div>
              </button>;
            })}
          </div>
        </section>

        <section id="menu-section" className="mx-auto max-w-7xl px-4 py-14 lg:px-8 lg:py-20">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="text-[10px] font-black tracking-[.24em] text-[#a84f32]">THE MENU</div><h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">قائمة برجر هاوس</h2><p className="mt-2 text-sm text-[#777064]">اختر صنفك، حدّد سنقل أو دبل، وأضف لمستك الخاصة.</p></div>
            <div className="relative w-full sm:max-w-xs"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8175]" size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="ابحث عن برجر أو مقبلات أو مشروب" className="w-full border border-[#d8d0c4] bg-[#fbfaf7] py-3 pr-10 pl-4 text-sm outline-none focus:border-[#a84f32]"/></div>
          </div>
          <div className="mb-9 flex gap-2 overflow-x-auto pb-2">
            <button onClick={()=>setActiveCategory('all')} className={activeCategory==='all'?'whitespace-nowrap bg-[#211f1b] px-5 py-3 text-xs font-bold text-white':'whitespace-nowrap border border-[#d8d0c4] bg-white px-5 py-3 text-xs font-bold text-[#655e53] hover:border-[#a84f32]'}>كل الأصناف</button>
            {categories.map((category)=> <button key={category.id} onClick={()=>setActiveCategory(category.id)} className={activeCategory===category.id?'whitespace-nowrap bg-[#211f1b] px-5 py-3 text-xs font-bold text-white':'whitespace-nowrap border border-[#d8d0c4] bg-white px-5 py-3 text-xs font-bold text-[#655e53] hover:border-[#a84f32]'}>{category.name_ar}</button>)}
          </div>

          {loading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map((i)=><div key={i} className="h-[390px] animate-pulse bg-[#e8e3da]"/>)}</div>
          : catalogError ? <div className="border border-[#d8d0c4] bg-white/60 p-8 text-center"><p className="font-bold">المنيو غير متاح حالياً</p><p className="mt-2 text-sm text-[#777064]">{catalogError}</p><button onClick={()=>location.reload()} className="mt-4 text-sm font-bold text-[#a84f32]">إعادة المحاولة</button></div>
          : availableProducts.length === 0 ? <div className="py-16 text-center text-sm text-[#777064]">لا توجد أصناف مطابقة في هذا القسم.</div>
          : <div className="space-y-14">
            {categoryGroups.map((group) => <section key={group.id}>
              <div className="mb-5 flex items-end justify-between border-b border-[#e1d9cd] pb-4"><div><div className="text-[10px] font-black tracking-[.18em] text-[#a84f32]">BURGER HOUSE MENU</div><h3 className="mt-1 text-xl font-black sm:text-2xl">{group.name_ar}</h3></div><span className="text-[11px] font-semibold text-[#81786d]">{group.products.length} أصناف</span></div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.products.map((product)=>{
                  const override=catalog?.branch_overrides?.find((entry:any)=>entry.branch_id===branchId&&entry.product_id===product.id);
                  return <article key={product.id} className="group overflow-hidden border border-[#e3dcd1] bg-[#fffdfa] transition hover:-translate-y-1 hover:shadow-[0_14px_35px_rgba(42,34,24,.09)]">
                    <button onClick={()=>openProduct(product)} className="relative block aspect-[5/3] w-full overflow-hidden bg-[#e8e2d8] text-right">
                      <img src={product.image_url || '/images/hero-wagyu-smash.jpg'} alt={product.name_ar} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.045]"/>
                      {product.is_featured && <span className="absolute right-4 top-4 bg-[#f6f0e5] px-3 py-1.5 text-[10px] font-black text-[#87442c]">اختيار البيت</span>}
                      <span className="absolute bottom-3 left-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f6f0e5] text-[#28251f] transition group-hover:bg-[#a84f32] group-hover:text-white"><Plus size={19}/></span>
                    </button>
                    <div className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="text-base font-black leading-7 text-[#24211d]">{product.name_ar}</h4><p className="mt-1 line-clamp-2 min-h-[42px] text-xs leading-6 text-[#777064]">{product.description_ar}</p></div><div className="shrink-0 pt-1 text-sm font-black text-[#a84f32]">{money(Number(override?.custom_base_price ?? product.base_price))}<span className="mr-1 text-[10px]">ر.س</span></div></div>
                      <div className="mt-4 flex items-center justify-between border-t border-[#eee8df] pt-3"><span className="flex items-center gap-1.5 text-[10px] text-[#82796d]"><Clock3 size={13}/> {product.prep_minutes || activeBranch?.prep_time_minutes || 15} دقيقة</span><button onClick={()=>openProduct(product)} className="inline-flex items-center gap-2 text-xs font-extrabold text-[#29251f] transition hover:text-[#a84f32]">تخصيص الصنف <ArrowLeft size={13}/></button></div>
                    </div>
                  </article>;
                })}
              </div>
            </section>)}
          </div>}
        </section>
      


      </>}

      {activeView === 'branches' && <section className="mx-auto min-h-[65vh] max-w-7xl px-4 py-14 lg:px-8">
        <div className="text-[10px] font-black tracking-[.24em] text-[#a65e36]">OUR LOCATIONS</div><h1 className="mt-2 text-4xl font-black">فروعنا</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[#777064]">اختر الفرع المناسب لاستلام طلبك. تختلف ساعات العمل والتوفر حسب الفرع.</p>
        <div className="mt-9 grid gap-5 md:grid-cols-2">{branches.filter((branch)=>branch.is_active).map((branch)=> <article key={branch.id} className="border border-[#ded8cd] bg-[#fbfaf7] p-6">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{branch.name_ar}</h2><p className="mt-2 text-sm leading-7 text-[#777064]">{branch.address_ar}</p></div><span className={branch.is_accepting_orders?'bg-[#e5eee5] px-3 py-1 text-[10px] font-bold text-[#426348]':'bg-[#eee8e1] px-3 py-1 text-[10px] font-bold text-[#8a6b54]'}>{branch.is_accepting_orders?'يستقبل الطلبات':'متوقف مؤقتاً'}</span></div>
          <div className="mt-5 flex flex-wrap gap-4 border-t border-[#e4ded4] pt-4 text-xs text-[#6d665b]"><span className="flex items-center gap-1.5"><Clock3 size={14}/> {branch.open_time} – {branch.close_time}</span><span className="flex items-center gap-1.5"><Phone size={14}/> {branch.phone || '—'}</span></div>
          <div className="mt-5 flex gap-2"><button onClick={()=>{setBranchId(branch.id);setActiveView('menu');window.scrollTo({top:0,behavior:'smooth'});}} className="bg-[#20201c] px-4 py-2.5 text-xs font-bold text-white">اختيار هذا الفرع</button>{branch.map_url&&<a href={branch.map_url} target="_blank" rel="noreferrer" className="border border-[#d8d0c4] px-4 py-2.5 text-xs font-bold">الاتجاهات</a>}</div>
        </article>)}</div>
      </section>}



      <footer className="bg-[#20201c] text-[#d6d0c5]">
        <div className="mx-auto grid max-w-7xl gap-9 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div><div className="flex items-center gap-3"><img src="/brand-mark.svg" alt="" className="h-10 w-10"/><div><div className="text-lg font-black tracking-[.12em] text-white">BURGER HOUSE</div><div className="text-[9px] tracking-[.2em] text-[#c5a27e]">CRAFTED OVER FIRE</div></div></div><p className="mt-3 max-w-xs text-xs leading-7 text-[#aaa397]">نكهات صُنعت على اللهب، ومكونات نختارها بعناية. اطلب مسبقاً واستلم من الفرع.</p></div>
          <div><div className="text-xs font-black text-white">تصفح</div><div className="mt-4 space-y-3 text-xs text-[#aaa397]"><button onClick={()=>setActiveView('menu')} className="block">المنيو</button><button onClick={()=>setActiveView('branches')} className="block">فروعنا</button><a href="/account/orders" className="block">طلباتي</a></div></div>
          <div><div className="text-xs font-black text-white">الاستلام</div><p className="mt-4 text-xs leading-7 text-[#aaa397]">جميع الطلبات عبر الموقع مخصصة للاستلام من الفرع فقط. لا نوفر التوصيل المنزلي حالياً.</p></div>
          <div><div className="text-xs font-black text-white">تواصل معنا</div><p className="mt-4 text-xs leading-7 text-[#aaa397]">{catalog?.settings?.support_phone || 'يسعدنا استقبال استفساراتكم عبر فروعنا.'}</p><a href="/account" className="mt-4 inline-block text-xs font-bold text-[#c28b60]">حساب العميل <ArrowLeft className="mr-1 inline" size={13}/></a></div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-[10px] text-[#827d73]">© {new Date().getFullYear()} BURGER HOUSE. جميع الحقوق محفوظة.</div>
      </footer>

      {selectedProduct && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-5" onClick={()=>setSelectedProduct(null)}>
        <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto bg-[#f8f6f1] text-[#201e1a] sm:max-h-[88vh]" onClick={(e)=>e.stopPropagation()}>
          <div className="relative aspect-[16/8] bg-[#e5dfd5]"><img src={selectedProduct.image_url} alt={selectedProduct.name_ar} className="h-full w-full object-cover"/><button onClick={()=>setSelectedProduct(null)} className="absolute left-4 top-4 rounded-full bg-[#f8f6f1] p-2"><X size={18}/></button></div>
          <div className="p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">{selectedProduct.name_ar}</h2><p className="mt-2 text-sm leading-7 text-[#777064]">{selectedProduct.description_ar}</p></div><span className="shrink-0 text-lg font-black text-[#a84f32]">{money(Number(catalog?.branch_overrides?.find((entry:any)=>entry.branch_id===branchId&&entry.product_id===selectedProduct.id)?.custom_base_price ?? selectedProduct.base_price) + Number(selectedProduct.sizes?.find((size)=>size.id===selectedSize)?.price_delta || 0))} ر.س</span></div>
            {!!selectedProduct.sizes?.length&&<div className="mt-6"><div className="mb-3 text-sm font-black">{selectedProduct.category_id === 'cat-drinks' ? 'اختر حجم المشروب' : selectedProduct.category_id === 'cat-sides' ? 'اختر حجم الحصة' : 'اختر سنقل أو دبل'}</div><div className="grid gap-2 sm:grid-cols-2">{selectedProduct.sizes.map((size)=><label key={size.id} className={selectedSize===size.id?'flex cursor-pointer items-center justify-between border border-[#a65e36] bg-[#f0e8df] p-3 text-xs font-bold':'flex cursor-pointer items-center justify-between border border-[#ddd6ca] bg-white p-3 text-xs font-bold'}><span>{size.name_ar}</span><span>{Number(size.price_delta)>0?'+':''}{money(Number(size.price_delta))} ر.س</span><input type="radio" className="sr-only" checked={selectedSize===size.id} onChange={()=>setSelectedSize(size.id)}/></label>)}</div></div>}
            {!!selectedProduct.allowed_addon_ids?.length&&<div className="mt-6"><div className="mb-3 text-sm font-black">إضافات حسب رغبتك</div><div className="space-y-2">{selectedProduct.allowed_addon_ids.map((id)=>addonFor(id)).filter(Boolean).map((addon)=> <label key={addon!.id} className="flex items-center justify-between border border-[#ddd6ca] bg-white px-3 py-3 text-xs"><span className="flex items-center gap-3"><input type="checkbox" checked={selectedAddons.includes(addon!.id)} onChange={(e)=>setSelectedAddons((current)=>e.target.checked?[...current,addon!.id]:current.filter((item)=>item!==addon!.id))} className="h-4 w-4 accent-[#a65e36]"/>{addon!.name_ar}</span><b>+{money(Number(addon!.price))} ر.س</b></label>)}</div></div>}
            <label className="mt-5 block text-xs font-bold">ملاحظات خاصة<input value={itemNote} onChange={(e)=>setItemNote(e.target.value)} placeholder="مثلاً: بدون مخلل" className="mt-2 w-full border border-[#ddd6ca] bg-white px-3 py-3 text-sm outline-none focus:border-[#a65e36]"/></label>
            <div className="mt-6 flex items-center justify-between gap-4"><div className="flex items-center gap-4 border border-[#ddd6ca] bg-white px-3 py-2"><button onClick={()=>setQuantity(Math.max(1,quantity-1))}><Minus size={15}/></button><b>{quantity}</b><button onClick={()=>setQuantity(Math.min(20,quantity+1))}><Plus size={15}/></button></div><button onClick={addToCart} className="flex-1 bg-[#a65e36] py-3.5 text-sm font-bold text-white">أضف إلى السلة</button></div>
          </div>
        </div>
      </div>}

      {cartOpen && <div className="fixed inset-0 z-[80] bg-black/55" onClick={()=>setCartOpen(false)}><aside className="absolute left-0 top-0 flex h-full w-full max-w-md flex-col bg-[#f8f6f1] text-[#201e1a]" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#ded8cd] p-5"><div><div className="text-lg font-black">سلة طلبك</div><div className="mt-1 text-xs text-[#777064]">{cartCount} أصناف</div></div><button onClick={()=>setCartOpen(false)} className="p-2"><X/></button></div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">{cart.length===0?<div className="py-16 text-center text-sm text-[#777064]">السلة فارغة حالياً.</div>:cart.map((line)=><div key={line.key} className="flex gap-3 border-b border-[#e5ded3] pb-4"><img src={line.product.image_url} alt="" className="h-20 w-24 object-cover"/><div className="min-w-0 flex-1"><div className="text-sm font-black">{line.product.name_ar}</div><div className="mt-1 text-[11px] text-[#777064]">{line.size?.name_ar}</div>{line.note&&<div className="mt-1 line-clamp-2 text-[10px] leading-5 text-[#8a8175]">{line.note}</div>}{line.addonIds.map((id)=><div key={id} className="text-[10px] text-[#777064]">{addonFor(id)?.name_ar}</div>)}<div className="mt-2 flex items-center justify-between"><b className="text-xs">{money(linePrice(line))} ر.س</b><div className="flex items-center gap-3"><button onClick={()=>updateQuantity(line.key,-1)}><Minus size={13}/></button><span className="text-xs font-bold">{line.quantity}</span><button onClick={()=>updateQuantity(line.key,1)}><Plus size={13}/></button></div></div></div></div>)}</div>
        {cart.length>0&&<div className="border-t border-[#ded8cd] p-5"><div className="flex justify-between text-xs text-[#777064]"><span>المجموع</span><span>{money(subtotal)} ر.س</span></div><div className="mt-2 flex justify-between text-xs text-[#777064]"><span>ضريبة القيمة المضافة</span><span>{money(vat)} ر.س</span></div><div className="mt-3 flex justify-between border-t border-[#ded8cd] pt-3 text-base font-black"><span>الإجمالي</span><span>{money(total)} ر.س</span></div><button onClick={()=>{setCartOpen(false);setCheckoutOpen(true);}} className="mt-5 w-full bg-[#a65e36] py-4 text-sm font-bold text-white">متابعة وإتمام الطلب</button><p className="mt-3 text-center text-[10px] text-[#82796d]">الاستلام من الفرع فقط — الدفع عند الاستلام</p></div>}
      </aside></div>}

      {checkoutOpen && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={()=>setCheckoutOpen(false)}><div className="max-h-[92vh] w-full max-w-lg overflow-y-auto bg-[#f8f6f1] p-6 text-[#201e1a] sm:p-8" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between"><div><div className="text-xl font-black">إتمام الطلب</div><div className="mt-1 text-xs text-[#777064]">تم تحميل بيانات حسابك. راجع الفرع وطريقة الدفع قبل التأكيد.</div></div><button onClick={()=>setCheckoutOpen(false)}><X/></button></div>
        <div className="mt-6 space-y-4">
          <label className="block text-xs font-bold">الاسم الكامل<input disabled={!customerLoggedIn} value={customerName} onChange={(e)=>setCustomerName(e.target.value)} className="mt-2 w-full border border-[#d8d0c4] bg-white px-3 py-3 text-sm outline-none focus:border-[#a65e36]" placeholder="اسمك"/></label>
          <label className="block text-xs font-bold">رقم الجوال<input disabled={!customerLoggedIn} value={customerPhone} onChange={(e)=>setCustomerPhone(e.target.value)} className="mt-2 w-full border border-[#d8d0c4] bg-white px-3 py-3 text-sm outline-none focus:border-[#a65e36]" placeholder="05xxxxxxxx" inputMode="tel" dir="ltr"/></label>
          {!customerLoggedIn && <div className="border border-[#d8c6aa] bg-[#f6efe4] p-4 text-xs leading-6 text-[#735538]">لإتمام الطلب وحفظه في سجلّك، يلزم تسجيل الدخول أولاً. <a href="/account" className="font-black underline">تسجيل الدخول أو إنشاء حساب</a></div>}
          <label className="block text-xs font-bold">فرع الاستلام<select value={branchId} onChange={(e)=>setBranchId(e.target.value)} className="mt-2 w-full border border-[#d8d0c4] bg-white px-3 py-3 text-sm outline-none focus:border-[#a65e36]">{branches.filter((branch)=>branch.is_active).map((branch)=><option key={branch.id} value={branch.id}>{branch.name_ar}</option>)}</select></label>
          <label className="block text-xs font-bold">طريقة الدفع عند الاستلام<select value={paymentId} onChange={(e)=>setPaymentId(e.target.value)} className="mt-2 w-full border border-[#d8d0c4] bg-white px-3 py-3 text-sm outline-none focus:border-[#a65e36]">{payments.map((payment)=><option key={payment.id} value={payment.id}>{payment.name_ar}</option>)}</select></label>
          <label className="block text-xs font-bold">ملاحظات للفرع<textarea value={customerNotes} onChange={(e)=>setCustomerNotes(e.target.value)} rows={2} className="mt-2 w-full border border-[#d8d0c4] bg-white px-3 py-3 text-sm outline-none focus:border-[#a65e36]" placeholder="ملاحظات إضافية (اختياري)"/></label>
          {captcha&&<div className="border border-[#d8d0c4] bg-white p-4"><div className="text-xs font-bold">تحقق أمني: {captcha.question_ar || captcha.question || 'أجب عن سؤال التحقق'}</div><input value={captchaAnswer} onChange={(e)=>setCaptchaAnswer(e.target.value)} className="mt-2 w-full border border-[#d8d0c4] px-3 py-2 text-sm" placeholder="الإجابة"/></div>}
          {orderError&&<div className="border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{orderError}</div>}
          <div className="space-y-2 border-t border-[#ded8cd] pt-4 text-xs"><div className="flex justify-between text-[#777064]"><span>المجموع</span><span>{money(subtotal)} ر.س</span></div><div className="flex justify-between text-[#777064]"><span>ضريبة القيمة المضافة</span><span>{money(vat)} ر.س</span></div><div className="flex justify-between border-t border-[#ded8cd] pt-3 text-base font-black"><span>الإجمالي شامل الضريبة</span><span>{money(total)} ر.س</span></div></div>
          <button disabled={submitting || !customerLoggedIn} onClick={captcha?verifyAndSubmit:submitOrder} className="w-full bg-[#a65e36] py-4 text-sm font-bold text-white disabled:opacity-50">{submitting?'جارٍ إرسال الطلب...':'تأكيد الطلب'}</button>
          <p className="text-center text-[10px] leading-5 text-[#82796d]">سيتم التحقق من الأسعار والتوفر على الخادم قبل اعتماد الطلب.</p>
        </div>
      </div></div>}

      {orderResult && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4"><div className="w-full max-w-md bg-[#f8f6f1] p-8 text-center text-[#201e1a]"><div className="mx-auto flex h-14 w-14 items-center justify-center bg-[#e4eee4] text-[#3f6746]"><Check size={28}/></div><div className="mt-5 text-[10px] font-black tracking-[.2em] text-[#a65e36]">ORDER RECEIVED</div><h2 className="mt-2 text-2xl font-black">وصل طلبك إلى الفرع</h2><p className="mt-2 text-sm text-[#777064]">الطلب الآن بانتظار موافقة الموظف. ستتغير حالته هنا تلقائياً عند المتابعة.</p><div className="mt-5 border border-[#ded8cd] bg-white p-4"><div className="text-xs text-[#777064]">رقم الطلب</div><div className="mt-1 text-3xl font-black tabular-nums">{orderResult.order_number ?? "—"}</div></div><a href="/account/orders" className="mt-5 block w-full bg-[#20201c] py-3.5 text-sm font-bold text-white">عرض طلباتي</a><button onClick={()=>setOrderResult(null)} className="mt-3 text-xs font-bold text-[#777064]">العودة للمنيو</button></div></div>}
    </main>
  );
}
