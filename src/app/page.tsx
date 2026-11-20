'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ArrowLeft, ArrowUpLeft, Check, ChevronDown, Clock3, Flame, MapPin,
  Menu, Minus, Plus, ShoppingBag, X, Search, ArrowRight, Instagram,
  Phone, Navigation, PackageCheck, Utensils, Truck, ShieldCheck, Download
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
const normalizeSearchText = (value: string) => value
  .toLocaleLowerCase('ar')
  .normalize('NFKC')
  .replace(/[أإآ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

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
    const normalizedSearch = normalizeSearchText(search);
    const searchableFields = [product.name_ar, product.name_en, product.description_ar, (product as any).description_en]
      .filter(Boolean)
      .map((value) => normalizeSearchText(String(value)));
    const matchesSearch = !normalizedSearch || searchableFields.some((value) => value.includes(normalizedSearch));
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
    <main className={`bh-storefront min-h-screen bg-[#09090B] text-[#FAFAFA] ${cartCount > 0 ? 'bh-has-cart-items' : ''}`} dir="rtl">
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
            <button onClick={() => setMobileMenuOpen((open) => !open)} className="relative z-[101] rounded-full border border-[#d8d1c6] p-2" aria-label={mobileMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={mobileMenuOpen} aria-controls="bh-mobile-menu"><Menu size={18}/></button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div
            className="bh-mobile-menu-overlay fixed inset-0 z-[100] flex h-[100dvh] min-h-[100vh] justify-end bg-black/80"
            role="presentation"
            onClick={() => setMobileMenuOpen(false)}
          >
            <aside
              dir="rtl"
              role="dialog"
              aria-modal="true"
              aria-label="قائمة BURGER HOUSE"
              onClick={(event) => event.stopPropagation()}
              id="bh-mobile-menu" className="flex h-full max-h-[100dvh] w-full max-w-[420px] flex-col overflow-y-auto overscroll-contain border-s border-[#34372d] bg-[#10110f] p-5 text-[#f5f0df] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#292c24] pb-5">
                <div className="flex items-center gap-3">
                  <img src="/brand-mark.svg" alt="" className="h-11 w-11 object-contain" />
                  <div>
                    <p className="text-sm font-black tracking-[.14em]">BURGER HOUSE</p>
                    <p className="mt-1 text-[10px] font-semibold tracking-[.16em] text-[#a1a1aa]">YOUR HOUSE. YOUR ORDERS.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="إغلاق القائمة" className="rounded-full border border-[#3b4033] bg-[#1b1e19] p-2.5 text-[#f5f0df]">
                  <X size={19} />
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-[#5b4a18] bg-gradient-to-br from-[#282311] to-[#171812] p-4">
                {customerLoggedIn ? (
                  <>
                    <p className="text-xs font-bold text-[#f5b800]">أهلًا بعودتك</p>
                    <p className="mt-2 text-lg font-black text-[#fff8e6]">{customerName || 'عميلنا العزيز'}</p>
                    <p className="mt-1 text-xs text-[#aaa48f]" dir="ltr">{customerPhone}</p>
                    <a href="/account" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#ffc82c] px-4 text-xs font-black text-[#11120e]">إدارة حسابي <ArrowLeft size={15} className="ms-2" /></a>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-black text-[#fff8e6]">خلّ تجربتك أسهل في كل زيارة</p>
                    <p className="mt-2 text-xs leading-6 text-[#b9b39f]">أنشئ حسابًا لتتابع طلباتك وتحفظ وجباتك المفضلة وتعيد طلبك بسرعة.</p>
                    <div className="mt-4 flex gap-2">
                      <a href="/account" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#ffc82c] px-3 text-xs font-black text-[#11120e]">تسجيل الدخول</a>
                      <a href="/account#signup" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[#5b4a18] px-3 text-xs font-bold text-[#f5d66b]">إنشاء حساب</a>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-5 rounded-2xl border border-[#2d3028] bg-[#171a15] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold tracking-[.12em] text-[#a1a1aa]">فرع الاستلام</p>
                    <p className="mt-2 text-sm font-black">{activeBranch?.name_ar || 'اختر فرعك'}</p>
                    <p className="mt-1 text-[11px] text-[#a1a1aa]">{activeBranch?.is_accepting_orders ? 'يستقبل الطلبات الآن' : 'تحقق من حالة الفرع قبل الطلب'}</p>
                  </div>
                  <span className={activeBranch?.is_accepting_orders ? 'mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]' : 'mt-1 h-2.5 w-2.5 rounded-full bg-amber-400'} />
                </div>
                <button type="button" onClick={() => { setActiveView('branches'); setMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[#3b4033] text-xs font-bold text-[#f5d66b]">
                  تغيير الفرع <MapPin size={14} className="ms-2" />
                </button>
              </div>

              <nav className="mt-5 space-y-1" aria-label="روابط المتجر">
                <button type="button" onClick={() => { setActiveView('menu'); setMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-sm font-bold hover:bg-[#20231d]">
                  <span className="flex items-center gap-3"><Utensils size={17} className="text-[#ffc82c]" /> المنيو الكامل</span><ArrowLeft size={15} className="text-[#777b69]" />
                </button>
                <button type="button" onClick={() => { setActiveView('branches'); setMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-sm font-bold hover:bg-[#20231d]">
                  <span className="flex items-center gap-3"><MapPin size={17} className="text-[#ffc82c]" /> فروعنا ومواقع الاستلام</span><ArrowLeft size={15} className="text-[#777b69]" />
                </button>
                <a href="/account/orders" className="flex min-h-12 items-center justify-between rounded-xl px-3 text-sm font-bold hover:bg-[#20231d]">
                  <span className="flex items-center gap-3"><PackageCheck size={17} className="text-[#ffc82c]" /> طلباتي وتتبع الطلب</span><ArrowLeft size={15} className="text-[#777b69]" />
                </a>
                <a href="/account" className="flex min-h-12 items-center justify-between rounded-xl px-3 text-sm font-bold hover:bg-[#20231d]">
                  <span className="flex items-center gap-3"><ShieldCheck size={17} className="text-[#ffc82c]" /> حسابي وبياناتي</span><ArrowLeft size={15} className="text-[#777b69]" />
                </a>
                <button type="button" onClick={() => { setMobileMenuOpen(false); window.setTimeout(() => window.dispatchEvent(new Event('bh:open-install')), 180); }} className="flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-sm font-bold hover:bg-[#20231d]">
                  <span className="flex items-center gap-3"><Download size={17} className="text-[#ffc82c]" /> تثبيت التطبيق على جهازك</span><ArrowLeft size={15} className="text-[#777b69]" />
                </button>
                <button type="button" onClick={() => { setMobileMenuOpen(false); setCartOpen(true); }} className="flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-sm font-bold hover:bg-[#20231d]">
                  <span className="flex items-center gap-3"><ShoppingBag size={17} className="text-[#ffc82c]" /> سلة المشتريات</span><span className="rounded-full bg-[#ffc82c] px-2.5 py-1 text-[10px] font-black text-[#11120e]">{cartCount}</span>
                </button>
              </nav>

              <div className="mt-auto border-t border-[#292c24] pt-5">
                {catalog?.settings?.support_phone && (
                  <a href={`tel:${catalog.settings.support_phone}`} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#3b4033] text-xs font-bold text-[#e8e2d0]">
                    <Phone size={15} className="text-[#ffc82c]" /> تواصل مع المطعم
                  </a>
                )}
                <p className="mt-4 text-center text-[10px] leading-6 text-[#777b69]">BURGER HOUSE · Crafted over fire</p>
              </div>
            </aside>
          </div>
        )}
      </header>

      {cartCount > 0 && (
        <div className="bh-mobile-orderbar" dir="rtl" role="region" aria-label="ملخص السلة">
          <div className="bh-mobile-orderbar-meta">
            <span className="bh-mobile-orderbar-count">{cartCount}</span>
            <div><b>طلبك جاهز للتأكيد</b><small>الإجمالي شامل الضريبة · {money(total)} ر.س</small></div>
          </div>
          <button onClick={() => setCartOpen(true)}>
            إتمام الطلب <ArrowLeft size={16}/>
          </button>
        </div>
      )}

      {activeView === 'menu' && <>
        <section className="bh-home-hero relative overflow-hidden text-[#f7f3eb]">
          <img src="/images/hero-wagyu-smash.jpg" alt="واغيو سماش هاوس من برجر هاوس" className="bh-home-hero-image"/>
          <div className="bh-home-hero-shade"/>
          <div className="bh-home-hero-content">
            <div className="bh-home-kicker"><span/> BURGER HOUSE <i>·</i> CRAFTED OVER FIRE</div>
            <p className="bh-home-overline">HOUSE SIGNATURE · MADE TO ORDER</p>
            <h1>البرجر كما<br/><em>يجب أن يكون.</em></h1>
            <p className="bh-home-description">واغيو طري، خبز بريوش محمّص، وصوصات البيت. اختر وجبتك واستلمها ساخنة من أقرب فرع.</p>
            <div className="bh-home-actions">
              <button onClick={() => document.getElementById('menu-section')?.scrollIntoView({behavior:'smooth'})}>اكتشف المنيو <ArrowLeft size={18}/></button>
              <button onClick={() => setActiveView('branches')}><MapPin size={17}/> فروع الاستلام</button>
            </div>
            <div className="bh-home-proof"><span><b>{branches.length}</b> فروع</span><span><b>طازج</b> عند الطلب</span><span><b>استلام</b> مباشر</span></div>
          </div>
          <div className="bh-home-price"><span>HOUSE SIGNATURE</span><b>واغيو سماش هاوس</b><small>ابدأ من ٣٨ ر.س</small></div>
          <div className="bh-home-scroll" aria-hidden="true">SCROLL TO EXPLORE <span>↓</span></div>
        </section>

        <section className="border-b border-[#e2dbcf] bg-[#fbf9f4]">
          <div className="bh-home-benefits mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-[#e5ded3] sm:px-8 sm:py-6">
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
          <div className="bh-category-rail grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

        <section className="bh-signature-section mx-auto max-w-7xl px-4 pb-8 pt-5 lg:px-8">
          <div className="bh-signature-heading">
            <div><span>THE HOUSE SELECTION</span><h2>تجارب تستحق التجربة</h2><p>اختيارات البيت التي نبدأ بها معك.</p></div>
            <button onClick={() => {setActiveCategory('all');document.getElementById('menu-section')?.scrollIntoView({behavior:'smooth'});}}>استكشف القائمة <ArrowLeft size={15}/></button>
          </div>
          <div className="bh-signature-grid bh-signature-rail">
            {products.filter(product => product.is_featured).slice(0,4).map((product,index) => {
              const override=catalog?.branch_overrides?.find((entry:any)=>entry.branch_id===branchId&&entry.product_id===product.id);
              return <button type="button" key={product.id} onClick={()=>openProduct(product)} className={index===0?'bh-signature-card bh-signature-main':'bh-signature-card'}>
                <img src={product.image_url || '/images/hero-wagyu-smash.jpg'} alt={product.name_ar} loading="lazy"/>
                <span className="bh-signature-shade"/>
                <span className="bh-signature-copy"><small>{index===0?'HOUSE SIGNATURE':'MADE FOR THE CRAVING'}</small><b>{product.name_ar}</b><em>من {money(Number(override?.custom_base_price ?? product.base_price))} ر.س</em></span>
                <span className="bh-signature-plus"><Plus size={18}/></span>
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
              <div className="bh-menu-product-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      {selectedProduct && <div className="bh-product-overlay fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" onClick={()=>setSelectedProduct(null)}>
        <div className="bh-product-dialog relative max-h-[94vh] w-full max-w-4xl overflow-y-auto bg-[#171713] text-[#f7f3e9] sm:max-h-[90vh] sm:rounded-2xl" onClick={(e)=>e.stopPropagation()}>
          <button onClick={()=>setSelectedProduct(null)} aria-label="إغلاق تفاصيل المنتج" className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur"><X size={19}/></button>
          <div className="bh-product-layout grid md:grid-cols-[.95fr_1.05fr]">
            <div className="bh-product-visual relative min-h-[230px] overflow-hidden bg-[#242117] sm:min-h-[360px]"><img src={selectedProduct.image_url || '/images/hero-wagyu-smash.jpg'} alt={selectedProduct.name_ar} className="absolute inset-0 h-full w-full object-cover"/><div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/10"/><div className="absolute bottom-5 right-5"><span className="text-[10px] font-black tracking-[.2em] text-[#f5c542]">BURGER HOUSE · FRESHLY MADE</span><p className="mt-2 text-xl font-black text-white">اختيارك… على ذوقك</p></div></div>
            <div className="bh-product-content flex flex-col p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5"><div className="min-w-0"><span className="text-[10px] font-black tracking-[.16em] text-[#f5c542]">تفاصيل الصنف</span><h2 className="mt-2 text-2xl font-black leading-tight text-white">{selectedProduct.name_ar}</h2><p className="mt-2 text-sm leading-7 text-[#aaa493]">{selectedProduct.description_ar}</p></div><div className="shrink-0 rounded-xl border border-[#665522] bg-[#292312] px-3 py-2 text-center"><span className="block text-[10px] text-[#c8b879]">السعر</span><b className="mt-1 block text-lg text-[#ffd65b]">{money(Number(catalog?.branch_overrides?.find((entry:any)=>entry.branch_id===branchId&&entry.product_id===selectedProduct.id)?.custom_base_price ?? selectedProduct.base_price) + Number(selectedProduct.sizes?.find((size)=>size.id===selectedSize)?.price_delta || 0))}</b><span className="text-[10px] text-[#c8b879]">ر.س</span></div></div>
              {!!selectedProduct.sizes?.length&&<section className="bh-choice-section mt-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black text-white">{selectedProduct.category_id === 'cat-drinks' ? 'اختر حجم المشروب' : selectedProduct.category_id === 'cat-sides' ? 'اختر حجم الحصة' : 'اختر حجم البرجر'}</h3><span className="text-[10px] text-[#aaa493]">اختيار واحد</span></div><div className="grid grid-cols-2 gap-2">{selectedProduct.sizes.map((size)=><label key={size.id} className={selectedSize===size.id?'bh-option-card is-selected flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-[#d6ad36] bg-[#302914] p-3 text-xs font-bold':'bh-option-card flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#202019] p-3 text-xs font-bold'}><span>{size.name_ar}</span><span className="shrink-0 text-[#ffd65b]">{Number(size.price_delta)>0?'+':''}{money(Number(size.price_delta))} ر.س</span><input type="radio" className="sr-only" checked={selectedSize===size.id} onChange={()=>setSelectedSize(size.id)}/></label>)}</div></section>}
              {!!selectedProduct.allowed_addon_ids?.length&&<section className="bh-choice-section mt-5"><div className="mb-3 flex items-end justify-between"><div><h3 className="text-sm font-black text-white">خلّها على ذوقك</h3><p className="mt-1 text-[11px] text-[#aaa493]">إضافات اختيارية لوجبتك</p></div><span className="text-[10px] text-[#aaa493]">يمكنك اختيار أكثر من إضافة</span></div><div className="grid gap-2 sm:grid-cols-2">{selectedProduct.allowed_addon_ids.map((id)=>addonFor(id)).filter(Boolean).map((addon)=> <label key={addon!.id} className={selectedAddons.includes(addon!.id)?'bh-addon-option is-selected flex min-h-[62px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#d6ad36] bg-[#302914] px-3 py-3':'bh-addon-option flex min-h-[62px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#202019] px-3 py-3'}><span className="flex min-w-0 items-center gap-3"><input type="checkbox" checked={selectedAddons.includes(addon!.id)} onChange={(e)=>setSelectedAddons((current)=>e.target.checked?[...current,addon!.id]:current.filter((item)=>item!==addon!.id))} className="h-4 w-4 shrink-0 accent-[#f5c542]"/><span className="text-xs font-bold leading-5 text-[#f5f0df]">{addon!.name_ar}</span></span><b className="shrink-0 rounded-lg bg-black/25 px-2 py-1 text-[11px] text-[#ffd65b]">+{money(Number(addon!.price))}</b></label>)}</div></section>}
              <label className="mt-5 block text-xs font-bold text-[#e9e2d2]">ملاحظات خاصة <span className="font-normal text-[#888373]">(اختياري)</span><input value={itemNote} onChange={(e)=>setItemNote(e.target.value)} placeholder="مثلاً: بدون مخلل أو صوص على الجانب" className="mt-2 w-full rounded-xl border border-white/10 bg-[#10100d] px-4 py-3 text-sm text-white outline-none placeholder:text-[#777363] focus:border-[#b89a42]"/></label>
              <div className="bh-product-actions mt-6 flex items-center gap-3 border-t border-white/10 pt-5"><div className="flex h-12 shrink-0 items-center gap-4 rounded-xl border border-white/10 bg-[#202019] px-3"><button aria-label="تقليل الكمية" onClick={()=>setQuantity(Math.max(1,quantity-1))}><Minus size={15}/></button><b className="min-w-4 text-center text-sm">{quantity}</b><button aria-label="زيادة الكمية" onClick={()=>setQuantity(Math.min(20,quantity+1))}><Plus size={15}/></button></div><button onClick={addToCart} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#f5c542] px-4 text-sm font-black text-[#17140b] transition hover:bg-[#ffd65b]">أضف للسلة <span>·</span> {money((Number(catalog?.branch_overrides?.find((entry:any)=>entry.branch_id===branchId&&entry.product_id===selectedProduct.id)?.custom_base_price ?? selectedProduct.base_price) + Number(selectedProduct.sizes?.find((size)=>size.id===selectedSize)?.price_delta || 0) + selectedAddons.reduce((sum,id)=>sum+Number(addonFor(id)?.price||0),0))*quantity)} ر.س</button></div>
            </div>
          </div>
        </div>
      </div>}

      {cartOpen && <div className="bh-cart-overlay fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm" onClick={()=>setCartOpen(false)}><aside className="bh-cart-drawer absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col bg-[#171713] text-[#f7f3e9] shadow-2xl" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5 sm:px-6"><div><span className="text-[10px] font-black tracking-[.18em] text-[#f5c542]">YOUR ORDER</span><div className="mt-1 text-xl font-black text-white">سلة طلبك <span className="mr-1 text-sm font-semibold text-[#aaa493]">({cartCount})</span></div></div><button onClick={()=>setCartOpen(false)} aria-label="إغلاق السلة" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5"><X/></button></div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">{cart.length===0?<div className="flex h-full flex-col items-center justify-center py-16 text-center"><div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#55471f] bg-[#282313] text-[#f5c542]"><ShoppingBag size={30}/></div><h3 className="mt-5 text-lg font-black text-white">سلتك تنتظر اختيارك</h3><p className="mt-2 text-sm text-[#aaa493]">أضف وجبتك المفضلة ونجهزها لك طازجة.</p><button onClick={()=>setCartOpen(false)} className="mt-6 rounded-xl bg-[#f5c542] px-6 py-3 text-sm font-black text-[#17140b]">استكشف المنيو</button></div>:cart.map((line)=><article key={line.key} className="bh-cart-item flex gap-3 rounded-xl border border-white/10 bg-[#202019] p-3"><img src={line.product.image_url || '/images/hero-wagyu-smash.jpg'} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover"/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="text-sm font-black leading-6 text-white">{line.product.name_ar}</div><b className="shrink-0 text-sm text-[#ffd65b]">{money(linePrice(line))} ر.س</b></div>{line.size?.name_ar&&<div className="mt-1 text-[11px] text-[#c8b879]">{line.size.name_ar}</div>}{line.addonIds.length>0&&<div className="mt-2 flex flex-wrap gap-1">{line.addonIds.map((id)=><span key={id} className="rounded-md bg-[#302914] px-2 py-1 text-[10px] text-[#e6d28e]">{addonFor(id)?.name_ar}</span>)}</div>}{line.note&&<div className="mt-2 line-clamp-2 text-[10px] leading-5 text-[#aaa493]">ملاحظة: {line.note}</div>}<div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-[#aaa493]">الكمية</span><div className="flex h-8 items-center gap-3 rounded-lg border border-white/10 bg-[#11110e] px-2"><button aria-label="تقليل الكمية" onClick={()=>updateQuantity(line.key,-1)}><Minus size={13}/></button><span className="min-w-3 text-center text-xs font-bold">{line.quantity}</span><button aria-label="زيادة الكمية" onClick={()=>updateQuantity(line.key,1)}><Plus size={13}/></button></div></div></div></article>)}</div>
        {cart.length>0&&<div className="bh-cart-summary border-t border-white/10 bg-[#11110e] p-5 sm:p-6"><div className="space-y-2 text-xs text-[#aaa493]"><div className="flex justify-between"><span>المجموع</span><span>{money(subtotal)} ر.س</span></div><div className="flex justify-between"><span>ضريبة القيمة المضافة</span><span>{money(vat)} ر.س</span></div></div><div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4"><span className="text-sm font-bold text-white">الإجمالي شامل الضريبة</span><strong className="text-2xl font-black text-[#ffd65b]">{money(total)} <small className="text-xs">ر.س</small></strong></div><button onClick={()=>{setCartOpen(false);setCheckoutOpen(true);}} className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#f5c542] py-4 text-sm font-black text-[#17140b] transition hover:bg-[#ffd65b]">متابعة وإتمام الطلب <ArrowLeft size={17}/></button><p className="mt-3 text-center text-[10px] text-[#8d8878]">استلام من الفرع · الدفع عند الاستلام</p></div>}
      </aside></div>}

      {checkoutOpen && <div className="bh-checkout-overlay fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={()=>setCheckoutOpen(false)}><div className="bh-checkout-dialog max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-[#171713] p-5 text-[#f7f3e9] shadow-2xl sm:rounded-2xl sm:p-7" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 pb-4"><div><span className="text-[10px] font-black tracking-[.18em] text-[#f5c542]">FINAL STEP</span><div className="mt-1 text-xl font-black text-white">إتمام الطلب</div><div className="mt-1 text-xs text-[#aaa493]">راجع بياناتك وفرع الاستلام قبل التأكيد.</div></div><button onClick={()=>setCheckoutOpen(false)} aria-label="إغلاق إتمام الطلب" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10"><X/></button></div>
        <div className="mt-5 space-y-4">
          <label className="block text-xs font-bold text-[#e9e2d2]">الاسم الكامل<input disabled={!customerLoggedIn} value={customerName} onChange={(e)=>setCustomerName(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#10100d] px-4 py-3 text-sm text-white outline-none focus:border-[#b89a42]" placeholder="اسمك"/></label>
          <label className="block text-xs font-bold text-[#e9e2d2]">رقم الجوال<input disabled={!customerLoggedIn} value={customerPhone} onChange={(e)=>setCustomerPhone(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#10100d] px-4 py-3 text-sm text-white outline-none focus:border-[#b89a42]" placeholder="05xxxxxxxx" inputMode="tel" dir="ltr"/></label>
          {!customerLoggedIn && <div className="rounded-xl border border-[#68572b] bg-[#282313] p-4 text-xs leading-6 text-[#e7d69e]">لإتمام الطلب وحفظه في سجلّك، يلزم تسجيل الدخول أولاً. <a href="/account" className="font-black underline">تسجيل الدخول أو إنشاء حساب</a></div>}
          <label className="block text-xs font-bold text-[#e9e2d2]">فرع الاستلام<select value={branchId} onChange={(e)=>setBranchId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#10100d] px-4 py-3 text-sm text-white outline-none focus:border-[#b89a42]">{branches.filter((branch)=>branch.is_active).map((branch)=><option key={branch.id} value={branch.id}>{branch.name_ar}</option>)}</select></label>
          <label className="block text-xs font-bold text-[#e9e2d2]">طريقة الدفع عند الاستلام<select value={paymentId} onChange={(e)=>setPaymentId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#10100d] px-4 py-3 text-sm text-white outline-none focus:border-[#b89a42]">{payments.map((payment)=><option key={payment.id} value={payment.id}>{payment.name_ar}</option>)}</select></label>
          <label className="block text-xs font-bold text-[#e9e2d2]">ملاحظات للفرع<textarea value={customerNotes} onChange={(e)=>setCustomerNotes(e.target.value)} rows={2} className="mt-2 w-full rounded-xl border border-white/10 bg-[#10100d] px-4 py-3 text-sm text-white outline-none focus:border-[#b89a42]" placeholder="ملاحظات إضافية (اختياري)"/></label>
          {captcha&&<div className="rounded-xl border border-white/10 bg-[#202019] p-4"><div className="text-xs font-bold">تحقق أمني: {captcha.question_ar || captcha.question || 'أجب عن سؤال التحقق'}</div><input value={captchaAnswer} onChange={(e)=>setCaptchaAnswer(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#10100d] px-4 py-3 text-sm" placeholder="الإجابة"/></div>}
          {orderError&&<div className="rounded-xl border border-red-900 bg-red-950/50 p-3 text-xs font-bold text-red-200">{orderError}</div>}
          <div className="space-y-2 rounded-xl border border-white/10 bg-[#202019] p-4 text-xs"><div className="flex justify-between text-[#aaa493]"><span>المجموع</span><span>{money(subtotal)} ر.س</span></div><div className="flex justify-between text-[#aaa493]"><span>ضريبة القيمة المضافة</span><span>{money(vat)} ر.س</span></div><div className="flex justify-between border-t border-white/10 pt-3 text-base font-black text-white"><span>الإجمالي شامل الضريبة</span><span className="text-[#ffd65b]">{money(total)} ر.س</span></div></div>
          <button disabled={submitting || !customerLoggedIn} onClick={captcha?verifyAndSubmit:submitOrder} className="w-full rounded-xl bg-[#f5c542] py-4 text-sm font-black text-[#17140b] disabled:opacity-50">{submitting?'جارٍ إرسال الطلب...':'تأكيد الطلب'}</button>
          <p className="text-center text-[10px] leading-5 text-[#8d8878]">سيتم التحقق من الأسعار والتوفر على الخادم قبل اعتماد الطلب.</p>
        </div>
      </div></div>}

      {orderResult && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4"><div className="w-full max-w-md bg-[#f8f6f1] p-8 text-center text-[#201e1a]"><div className="mx-auto flex h-14 w-14 items-center justify-center bg-[#e4eee4] text-[#3f6746]"><Check size={28}/></div><div className="mt-5 text-[10px] font-black tracking-[.2em] text-[#a65e36]">ORDER RECEIVED</div><h2 className="mt-2 text-2xl font-black">وصل طلبك إلى الفرع</h2><p className="mt-2 text-sm text-[#777064]">الطلب الآن بانتظار موافقة الموظف. ستتغير حالته هنا تلقائياً عند المتابعة.</p><div className="mt-5 border border-[#ded8cd] bg-white p-4"><div className="text-xs text-[#777064]">رقم الطلب</div><div className="mt-1 text-3xl font-black tabular-nums">{orderResult.order_number ?? "—"}</div></div><a href="/account/orders" className="mt-5 block w-full bg-[#20201c] py-3.5 text-sm font-bold text-white">عرض طلباتي</a><button onClick={()=>setOrderResult(null)} className="mt-3 text-xs font-bold text-[#777064]">العودة للمنيو</button></div></div>}
    </main>
  );
}
