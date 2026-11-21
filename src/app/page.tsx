'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseCustomerBrowserClient } from '@/lib/supabase/client';
import PromoCarousel from '@/components/promo-carousel';
import SafeFoodImage from '@/components/safe-food-image';
import StorefrontAdminEditor from '@/components/storefront-admin-editor';
import {
  ArrowLeft, ArrowUpLeft, Check, ChevronDown, Clock3, Flame, MapPin,
  Menu, Minus, Plus, ShoppingBag, X, Search, ArrowRight, Instagram,
  Phone, Navigation, PackageCheck, Utensils, Truck, ShieldCheck, Download, Heart
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

const ORDER_STATUS_LABELS: Record<string, string> = { new: 'بانتظار موافقة الفرع', pending_confirmation: 'بانتظار تأكيد الفرع', accepted: 'تم قبول الطلب — قيد التجهيز', preparing: 'طلبك قيد التجهيز', ready_for_pickup: 'طلبك جاهز للاستلام', completed: 'تم استلام طلبك', rejected: 'تم رفض الطلب', cancelled: 'تم إلغاء الطلب' };
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
  const [customerAuthMode, setCustomerAuthMode] = useState<'signup' | 'login'>('signup');
  const [customerPassword, setCustomerPassword] = useState('');
  const [customerConfirmPassword, setCustomerConfirmPassword] = useState('');
  const [customerAuthBusy, setCustomerAuthBusy] = useState(false);
  const [customerAuthError, setCustomerAuthError] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [orderError, setOrderError] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteBusy, setFavoriteBusy] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponPreview, setCouponPreview] = useState<any>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const [activeView, setActiveView] = useState<'menu' | 'branches'>('menu');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [captcha, setCaptcha] = useState<any>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  useEffect(() => {
    let active = true;
    const loadCustomer = async () => {
      try {
        const supabase = createSupabaseCustomerBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        const isCustomer = user && (
          user.app_metadata?.customer_account === true ||
          String(user.email || '').endsWith('@login.burgerhouse.invalid') ||
          Boolean(user.phone)
        );
        if (isCustomer) {
          const { data: profile } = await supabase.from('customer_profiles').select('full_name, phone').eq('id', user.id).maybeSingle();
          setCustomerLoggedIn(true);
          const savedName = String(profile?.full_name || user.user_metadata?.full_name || '');
          setCustomerName(/^مدير(?:ة)?\s+فرع\b/.test(savedName) ? '' : savedName);
          setCustomerPhone(profile?.phone || user.app_metadata?.customer_phone || user.phone || '');
        } else {
          setCustomerLoggedIn(false);
          setCustomerName('');
          setCustomerPhone('');
        }
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
    if (showFavoritesOnly && !favoriteIds.includes(product.id)) return false;
    const override = catalog?.branch_overrides?.find((entry: any) => entry.branch_id === branchId && entry.product_id === product.id);
    const branchControl = catalog?.branch_products?.find((entry: any) => entry.branch_id === branchId && entry.product_id === product.id);
    const soldOutToday = branchControl?.sold_out_until && new Date(branchControl.sold_out_until).getTime() > Date.now();
    const branchCategory = catalog?.branch_categories?.find((entry: any) => entry.branch_id === branchId && entry.category_id === product.category_id);
    const matchesCategory = activeCategory === 'all' || product.category_id === activeCategory;
    const normalizedSearch = normalizeSearchText(search);
    const searchableFields = [product.name_ar, product.name_en, product.description_ar, (product as any).description_en]
      .filter(Boolean)
      .map((value) => normalizeSearchText(String(value)));
    const matchesSearch = !normalizedSearch || searchableFields.some((value) => value.includes(normalizedSearch));
    return matchesCategory && matchesSearch && override?.is_available !== false && branchControl?.is_available !== false && !branchControl?.manual_disabled && !soldOutToday && branchCategory?.is_active !== false;
  }), [products, activeCategory, search, catalog, branchId, showFavoritesOnly, favoriteIds]);

  const categoryGroups = useMemo(() => categories
    .map((category) => ({ ...category, products: availableProducts.filter((product) => product.category_id === category.id) }))
    .filter((group) => group.products.length > 0 && catalog?.branch_categories?.find((entry: any) => entry.branch_id === branchId && entry.category_id === group.id)?.is_active !== false), [categories, availableProducts, catalog, branchId]);




  useEffect(() => {
    if (!customerLoggedIn) { setFavoriteIds([]); return; }
    let active = true;
    fetch('/api/account/favorites', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => { if (!response.ok) return []; const data = await response.json(); return (data.favorites || []).map((item: any) => String(item.product_id)); })
      .then(ids => { if (active) setFavoriteIds(ids); })
      .catch(() => { if (active) setFavoriteIds([]); });
    return () => { active = false; };
  }, [customerLoggedIn]);

  const toggleFavorite = async (productId: string) => {
    if (!customerLoggedIn) { setOrderError('سجّل الدخول إلى حساب العميل لحفظ منتجاتك المفضلة.'); setCheckoutOpen(true); return; }
    if (favoriteBusy) return;
    setFavoriteBusy(productId);
    const removing = favoriteIds.includes(productId);
    try {
      const response = await fetch('/api/account/favorites', {
        method: removing ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', cache: 'no-store',
        body: JSON.stringify({ product_id: productId })
      });
      if (!response.ok) throw new Error('تعذر تحديث المفضلة. حاول مرة أخرى.');
      setFavoriteIds(current => removing ? current.filter(id => id !== productId) : [...current, productId]);
    } catch (error: any) { setOrderError(error.message || 'تعذر تحديث المفضلة'); }
    finally { setFavoriteBusy(null); }
  };

  const addonFor = (id: string) => addons.find((addon) => addon.id === id);
  const linePrice = (line: CartLine) => {
    const override = catalog?.branch_overrides?.find((entry: any) => entry.branch_id === branchId && entry.product_id === line.product.id);
    const base = Number(override?.custom_base_price ?? line.product.base_price);
    const sizeDelta = Number(line.size?.price_delta || 0);
    const addonTotal = line.addonIds.reduce((sum, id) => sum + Number(addonFor(id)?.price || 0), 0);
    return (base + sizeDelta + addonTotal) * line.quantity;
  };
  const subtotal = cart.reduce((sum, line) => sum + linePrice(line), 0);
  const discountAmount = couponPreview?.code === couponCode.trim().toUpperCase() ? Number(couponPreview.discount_amount || 0) : 0;
  const vat = Number((((subtotal - discountAmount) * Number(catalog?.settings?.vat_percentage ?? 15)) / 100).toFixed(2));
  const total = subtotal - discountAmount + vat;
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

  const authenticateCustomer = async () => {
    setCustomerAuthError('');
    const normalized = normalizePhone(customerPhone);
    if (normalized.length !== 13) {
      setCustomerAuthError('أدخل رقم جوال سعودي صحيحًا يبدأ بـ 05.');
      return;
    }
    if (customerAuthMode === 'signup' && customerName.trim().length < 2) {
      setCustomerAuthError('اكتب اسمك الكامل.');
      return;
    }
    if (customerAuthMode === 'signup' && customerPassword !== customerConfirmPassword) {
      setCustomerAuthError('كلمتا المرور غير متطابقتين.');
      return;
    }
    if (customerPassword.length < 8) {
      setCustomerAuthError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    setCustomerAuthBusy(true);
    try {
      const response = await fetch('/api/account/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ mode: customerAuthMode, phone: customerAuthMode === 'signup' ? customerPhone : normalized, password: customerPassword, fullName: customerName.trim() })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message_ar || 'تعذر إكمال تسجيل الحساب. حاول مرة أخرى.');
      const supabase = createSupabaseCustomerBrowserClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user || user.app_metadata?.customer_account !== true) {
        throw new Error('تم إنشاء الحساب لكن تعذر تحميل جلسة الدخول. أعد تسجيل الدخول.');
      }
      const { data: profile } = await supabase.from('customer_profiles').select('full_name, phone').eq('id', user.id).maybeSingle();
      setCustomerName(profile?.full_name || customerName.trim());
      setCustomerPhone(profile?.phone || normalized);
      setCustomerLoggedIn(true);
      setCustomerPassword('');
      setCustomerConfirmPassword('');
      setCustomerAuthError('');
    } catch (error: any) {
      setCustomerAuthError(error?.message || 'تعذر إكمال العملية. حاول مرة أخرى.');
    } finally {
      setCustomerAuthBusy(false);
    }
  };


  const validateCoupon = async () => {
    setOrderError('');
    if (!couponCode.trim()) { setCouponPreview(null); return; }
    setCouponBusy(true);
    try {
      const response = await fetch('/api/coupons/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify({ code: couponCode, branch_id: branchId, subtotal }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message_ar || 'تعذر تطبيق رمز الخصم.');
      setCouponCode(result.code);
      setCouponPreview(result);
    } catch (error: any) { setCouponPreview(null); setOrderError(error.message || 'رمز الخصم غير صالح.'); }
    finally { setCouponBusy(false); }
  };

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
          coupon_code: couponPreview?.code || null,
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
          coupon_code: couponPreview?.code || null,
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

  if (catalog?.settings && (catalog.settings.site_online === false || catalog.settings.maintenance_mode === true)) {
    const message = catalog.settings.maintenance_message_ar || 'نعتذر عن استقبال الطلبات حاليًا. نعود إليكم قريبًا.';
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#0A0A0C] px-5 py-12 text-[#F6F3EC]">
        <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#141417] p-8 text-center">
          <img src="/brand-mark.svg" alt="BURGER HOUSE" className="mx-auto h-16 w-16"/>
          <p className="mt-6 text-[10px] font-bold tracking-[.2em] text-[#F2B705]">BURGER HOUSE</p>
          <h1 className="mt-3 text-2xl font-bold">{catalog.settings.site_online === false ? 'نعود إليكم قريبًا' : 'نجهّز لكم تجربة أفضل'}</h1>
          <p className="mt-3 text-sm leading-7 text-[#9E9BA3]">{message}</p>
          <a href="https://wa.me/966535717670" className="mt-6 inline-flex rounded-lg bg-[#F2B705] px-6 py-3 text-xs font-bold text-[#0A0A0C]">تواصل معنا</a>
        </section>
      </main>
    );
  }

  return (
    <main className={`bh-storefront min-h-screen pb-[env(safe-area-inset-bottom)] bg-[#09090B] text-[#FAFAFA] ${cartCount > 0 ? 'bh-has-cart-items' : ''}`} dir="rtl">
      <StorefrontAdminEditor />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#09090B]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="bh-storefront-announcement bg-[#09090B] px-4 py-2 text-center text-[11px] font-semibold tracking-wide text-[#e9e2d5] sm:text-xs">
          تحضير طازج عند الطلب <span className="mx-2 text-[#b77b45]">•</span> استلام مباشر من فروعنا
        </div>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="Burger House">
            <img src="/brand-logo.svg" alt="BURGER HOUSE — Good Food, Great Mood" className="h-12 w-auto max-w-[220px] object-contain"/>
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
                <button type="button" onClick={() => { window.dispatchEvent(new Event('bh:open-install')); setMobileMenuOpen(false); }} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#F5B800]/35 bg-[#F5B800]/10 text-xs font-bold text-[#FFD036]">
                  <Download size={15}/> تثبيت التطبيق على جهازك
                </button>
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
        <section className="bh-v2-hero" aria-labelledby="bh-home-title">
          <div className="bh-v2-hero-copy">
            <div className="bh-v2-eyebrow"><span/> BURGER HOUSE <i>·</i> CRAFTED OVER FIRE</div>
            <p className="bh-v2-kicker">طازج من المطبخ إلى يدك</p>
            <h1 id="bh-home-title">اختَر وجبتك.<br/><em>ونحن نجهّز الباقي.</em></h1>
            <p className="bh-v2-lead">برجر يُحضّر عند الطلب، وإضافات تختارها بنفسك. حدّد فرع الاستلام واطلب خلال دقائق.</p>
            <div className="bh-v2-hero-actions">
              <button type="button" onClick={() => document.getElementById('menu-section')?.scrollIntoView({behavior:'smooth'})}>ابدأ طلبك <ArrowLeft size={17}/></button>
              <button type="button" onClick={() => setActiveView('branches')}><MapPin size={16}/> مواقع الفروع</button>
            </div>
            <div className="bh-v2-branch-status">
              <span className={activeBranch?.is_accepting_orders ? 'bh-v2-status-dot is-open' : 'bh-v2-status-dot'}/>
              <div><b>{activeBranch?.name_ar || 'اختر فرع الاستلام'}</b><small>{activeBranch?.is_accepting_orders ? 'يستقبل الطلبات الآن' : 'تحقق من توفر الطلبات في الفرع'}</small></div>
              <button type="button" onClick={() => setActiveView('branches')}>تغيير الفرع</button>
            </div>
          </div>
          <div className="bh-v2-hero-media">
            <SafeFoodImage src="/images/hero-wagyu-smash.jpg" categoryId="cat-wagyu" alt="برجر واغيو سماش من برجر هاوس" loading="eager"/>
            <div className="bh-v2-media-caption"><span>MADE TO ORDER</span><b>طازج. ساخن. على ذوقك.</b></div>
            <div className="bh-v2-media-index">01 <i>/</i> 03</div>
          </div>
        </section>

        <section className="bh-v2-promise-strip" aria-label="مميزات الطلب">
          <div><span>01</span><b>اختيارك بالكامل</b><small>حجم وإضافات كما تحب</small></div>
          <div><span>02</span><b>تحضير عند الطلب</b><small>يبدأ بعد تأكيد الفرع</small></div>
          <div><span>03</span><b>استلام واضح</b><small>تابع حالة طلبك خطوة بخطوة</small></div>
        </section>



        <section className="bh-branch-picker border-b border-[#ded8cd] bg-[#ebe7df]">
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

        <PromoCarousel banners={catalog?.promo_banners || []} branchId={branchId} products={products} onOpenProduct={(product) => openProduct(product as Product)} onSelectCategory={setActiveCategory} />

        <section id="menu-section" className="mx-auto max-w-7xl px-4 py-14 lg:px-8 lg:py-20">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="text-[10px] font-black tracking-[.24em] text-[#a84f32]">THE MENU</div><h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">قائمة برجر هاوس</h2><p className="mt-2 text-sm text-[#777064]">اختر صنفك، حدّد سنقل أو دبل، وأضف لمستك الخاصة.</p></div>
            <div className="relative w-full sm:max-w-xs"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8175]" size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="ابحث عن برجر أو مقبلات أو مشروب" className="w-full border border-[#d8d0c4] bg-[#fbfaf7] py-3 pr-10 pl-4 text-sm outline-none focus:border-[#a84f32]"/></div>
          </div>
          <div className="bh-category-rail mb-9 flex gap-2 overflow-x-auto pb-2">
            <button onClick={()=>setActiveCategory('all')} className={activeCategory==='all'?'whitespace-nowrap rounded-xl border border-[#F5B800] bg-[#F5B800] px-5 py-3 text-xs font-bold text-[#09090B]':'whitespace-nowrap rounded-xl border border-white/[0.08] bg-[#1A1A20] px-5 py-3 text-xs font-bold text-[#E4E4E7] hover:border-[#F5B800]'}>كل الأصناف</button>
            {categories.map((category)=> <button key={category.id} onClick={()=>setActiveCategory(category.id)} className={activeCategory===category.id?'whitespace-nowrap rounded-xl border border-[#F5B800] bg-[#F5B800] px-5 py-3 text-xs font-bold text-[#09090B]':'whitespace-nowrap rounded-xl border border-white/[0.08] bg-[#1A1A20] px-5 py-3 text-xs font-bold text-[#E4E4E7] hover:border-[#F5B800]'}>{category.name_ar}</button>)}
          </div>

          {loading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map((i)=><div key={i} className="h-[390px] animate-pulse bg-[#e8e3da]"/>)}</div>
          : catalogError ? <div className="border border-[#d8d0c4] bg-white/60 p-8 text-center"><p className="font-bold">المنيو غير متاح حالياً</p><p className="mt-2 text-sm text-[#777064]">{catalogError}</p><button onClick={()=>location.reload()} className="mt-4 text-sm font-bold text-[#a84f32]">إعادة المحاولة</button></div>
          : availableProducts.length === 0 ? <div className="py-16 text-center text-sm text-[#777064]">لا توجد أصناف مطابقة في هذا القسم.</div>
          : <div className="space-y-14">
            {categoryGroups.map((group) => <section key={group.id}>
              <div className="mb-5 flex items-end justify-between border-b border-[#e1d9cd] pb-4"><div><div className="text-[10px] font-black tracking-[.18em] text-[#a84f32]">BURGER HOUSE MENU</div><h3 className="mt-1 text-xl font-black sm:text-2xl">{group.name_ar}</h3></div><div className="flex items-center gap-3"><button type="button" onClick={()=>setShowFavoritesOnly(v=>!v)} className={showFavoritesOnly?'rounded-full bg-[#17191B] px-3 py-2 text-[10px] font-bold text-[#F2EBDD]':'rounded-full border border-[#d9d1c5] px-3 py-2 text-[10px] font-bold text-[#5f594f]'}>{showFavoritesOnly?'عرض كل المنتجات':'المفضلة'} ({favoriteIds.length})</button><span className="text-[11px] font-semibold text-[#81786d]">{group.products.length} أصناف</span></div></div>
              <div className="bh-v2-product-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.products.map((product)=>{
                  const override=catalog?.branch_overrides?.find((entry:any)=>entry.branch_id===branchId&&entry.product_id===product.id);
                  return <article key={product.id} className="bh-v2-product-card">
                    <button type="button" onClick={()=>openProduct(product)} aria-label={`تخصيص ${product.name_ar}`} className="bh-v2-product-photo">
                      <SafeFoodImage src={product.image_url} categoryId={product.category_id} alt={product.name_ar} loading="lazy" className="h-full w-full object-cover"/>
                      {product.is_featured && <span className="bh-v2-product-tag">اختيار البيت</span>}
                    </button>
                    <div className="bh-v2-product-info">
                      <div className="mb-2 flex justify-end"><button type="button" onClick={()=>void toggleFavorite(product.id)} disabled={favoriteBusy===product.id} aria-label={favoriteIds.includes(product.id)?'إزالة من المفضلة':'إضافة إلى المفضلة'} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-[#242428] text-[#F5B800] disabled:opacity-50"><Heart size={17} fill={favoriteIds.includes(product.id)?'currentColor':'none'}/></button></div>
                      <div className="bh-v2-product-title"><h4>{product.name_ar}</h4><span>{money(Number(override?.custom_base_price ?? product.base_price))} <small>ر.س</small></span></div>
                      <p>{product.description_ar}</p>
                      <div className="bh-v2-product-bottom">
                        <span><Clock3 size={13}/> {product.prep_minutes || activeBranch?.prep_time_minutes || 15} دقيقة</span>
                        <button type="button" onClick={()=>openProduct(product)}>خصّص طلبك <Plus size={15}/></button>
                      </div>
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
          <button onClick={()=>setSelectedProduct(null)} aria-label="إغلاق تفاصيل المنتج" className="absolute left-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white backdrop-blur-md"><X size={19}/></button>
          <div className="bh-product-layout grid md:grid-cols-[.95fr_1.05fr]">
            <div className="bh-product-visual relative h-52 w-full overflow-hidden rounded-t-3xl bg-[#242117] sm:h-60"><SafeFoodImage src={selectedProduct.image_url} categoryId={selectedProduct.category_id} alt={selectedProduct.name_ar} className="h-full w-full object-cover"/><div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#131317] via-transparent to-transparent"/><div className="absolute bottom-4 right-5"><span className="text-[10px] font-black tracking-[.2em] text-[#f5c542]">BURGER HOUSE · FRESHLY MADE</span></div></div>
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
        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">{cart.length===0?<div className="flex h-full flex-col items-center justify-center py-16 text-center"><div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#55471f] bg-[#282313] text-[#f5c542]"><ShoppingBag size={30}/></div><h3 className="mt-5 text-lg font-black text-white">سلتك تنتظر اختيارك</h3><p className="mt-2 text-sm text-[#aaa493]">أضف وجبتك المفضلة ونجهزها لك طازجة.</p><button onClick={()=>setCartOpen(false)} className="mt-6 rounded-xl bg-[#f5c542] px-6 py-3 text-sm font-black text-[#17140b]">استكشف المنيو</button></div>:cart.map((line)=><article key={line.key} className="bh-cart-item flex gap-2 rounded-lg border border-white/10 bg-[#202019] p-2"><SafeFoodImage src={line.product.image_url} categoryId={line.product.category_id} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover"/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="text-xs font-bold leading-5 text-white">{line.product.name_ar}</div><b className="shrink-0 text-xs text-[#ffd65b]">{money(linePrice(line))} ر.س</b></div>{line.size?.name_ar&&<div className="mt-1 text-[11px] text-[#c8b879]">{line.size.name_ar}</div>}{line.addonIds.length>0&&<div className="mt-2 flex flex-wrap gap-1">{line.addonIds.map((id)=><span key={id} className="rounded-md bg-[#302914] px-2 py-1 text-[10px] text-[#e6d28e]">{addonFor(id)?.name_ar}</span>)}</div>}{line.note&&<div className="mt-2 line-clamp-2 text-[10px] leading-5 text-[#aaa493]">ملاحظة: {line.note}</div>}<div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-[#aaa493]">الكمية</span><div className="flex h-8 items-center gap-3 rounded-lg border border-white/10 bg-[#11110e] px-2"><button aria-label="تقليل الكمية" onClick={()=>updateQuantity(line.key,-1)}><Minus size={13}/></button><span className="min-w-3 text-center text-xs font-bold">{line.quantity}</span><button aria-label="زيادة الكمية" onClick={()=>updateQuantity(line.key,1)}><Plus size={13}/></button></div></div></div></article>)}</div>
        {cart.length>0&&<div className="bh-cart-summary border-t border-white/10 bg-[#11110e] p-5 sm:p-6"><div className="space-y-2 text-xs text-[#aaa493]"><div className="flex justify-between"><span>المجموع</span><span>{money(subtotal)} ر.س</span></div><div className="flex justify-between"><span>ضريبة القيمة المضافة</span><span>{money(vat)} ر.س</span></div></div><div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4"><span className="text-sm font-bold text-white">الإجمالي شامل الضريبة</span><strong className="text-2xl font-black text-[#ffd65b]">{money(total)} <small className="text-xs">ر.س</small></strong></div><button onClick={()=>{setCartOpen(false);setCheckoutOpen(true);}} className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#f5c542] py-4 text-sm font-black text-[#17140b] transition hover:bg-[#ffd65b]">متابعة وإتمام الطلب <ArrowLeft size={17}/></button><p className="mt-3 text-center text-[10px] text-[#8d8878]">استلام من الفرع · الدفع عند الاستلام</p></div>}
      </aside></div>}

      {checkoutOpen && <div className="bh-checkout-overlay fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={()=>setCheckoutOpen(false)}><div className="bh-checkout-dialog max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-[#171713] p-5 text-[#f7f3e9] shadow-2xl sm:rounded-2xl sm:p-7" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 pb-4"><div><span className="text-[10px] font-black tracking-[.18em] text-[#f5c542]">FINAL STEP</span><div className="mt-1 text-xl font-black text-white">إتمام الطلب</div><div className="mt-1 text-xs text-[#aaa493]">راجع بياناتك وفرع الاستلام قبل التأكيد.</div></div><button onClick={()=>setCheckoutOpen(false)} aria-label="إغلاق إتمام الطلب" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10"><X/></button></div>
        <div className="mt-5 space-y-4">
          <section className="rounded-xl border border-white/10 bg-[#202019] p-4">
            <label className="mb-2 block text-xs font-bold text-[#e9e2d2]" htmlFor="bh-coupon">رمز الخصم</label>
            <div className="flex gap-2"><input id="bh-coupon" value={couponCode} onChange={e=>{setCouponCode(e.target.value.toUpperCase());setCouponPreview(null);}} placeholder="أدخل رمز الخصم" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#10100d] px-3 py-3 text-sm text-white outline-none" dir="ltr"/><button type="button" disabled={couponBusy||!couponCode.trim()} onClick={()=>void validateCoupon()} className="rounded-lg bg-[#E76F32] px-4 text-xs font-black text-white disabled:opacity-50">{couponBusy?'جارٍ التحقق':'تطبيق'}</button></div>
            {couponPreview && <p className="mt-2 text-xs font-bold text-emerald-300">تم تطبيق {couponPreview.code} — خصم {money(discountAmount)} ر.س</p>}
          </section>
          {!customerDataLoaded ? (
            <div className="rounded-xl border border-white/10 bg-[#202019] p-4 text-xs text-[#c9c2b3]">جارٍ تحميل بيانات حسابك...</div>
          ) : customerLoggedIn ? (
            <div className="rounded-xl border border-[#5c512b] bg-[#242116] p-4">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold text-[#e5c45a]">بيانات حسابك المحفوظة</p>{customerName ? <p className="mt-1 text-sm font-black text-white">{customerName}</p> : <label className="mt-2 block text-xs font-bold text-[#e9e2d2]">الاسم الكامل<input value={customerName} onChange={e=>setCustomerName(e.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#10100d] px-3 py-2.5 text-sm text-white outline-none" placeholder="اكتب اسمك الكامل"/></label>}<p className="mt-1 text-xs text-[#c5bdab]" dir="ltr">{customerPhone}</p></div><span className="rounded-full bg-emerald-900/40 px-3 py-1 text-[10px] font-bold text-emerald-300">مسجل الدخول</span></div>
            </div>
          ) : (
            <div className="rounded-xl border border-[#68572b] bg-[#282313] p-4">
              <div className="mb-3"><p className="text-sm font-black text-white">{customerAuthMode === 'signup' ? 'أنشئ حسابك وأكمل طلبك' : 'تسجيل الدخول لإكمال الطلب'}</p><p className="mt-1 text-[11px] leading-5 text-[#cfc39c]">بياناتك تُحفظ مرة واحدة وتظهر تلقائيًا في طلباتك القادمة.</p></div>
              <div className="mb-4 grid grid-cols-2 rounded-lg bg-black/25 p-1 text-xs font-bold"><button type="button" onClick={()=>{setCustomerAuthMode('signup');setCustomerAuthError('');}} className={`rounded-md py-2 ${customerAuthMode==='signup'?'bg-[#f5c542] text-[#17140b]':'text-[#d4cba9]'}`}>إنشاء حساب</button><button type="button" onClick={()=>{setCustomerAuthMode('login');setCustomerAuthError('');}} className={`rounded-md py-2 ${customerAuthMode==='login'?'bg-[#f5c542] text-[#17140b]':'text-[#d4cba9]'}`}>لدي حساب</button></div>
              <div className="space-y-3">
                {customerAuthMode==='signup' && <label className="block text-xs font-bold text-[#e9e2d2]">الاسم الكامل<input value={customerName} onChange={e=>setCustomerName(e.target.value)} autoComplete="name" className="mt-2 w-full rounded-lg border border-white/10 bg-[#10100d] px-3 py-2.5 text-sm text-white outline-none" placeholder="اكتب اسمك"/></label>}
                <label className="block text-xs font-bold text-[#e9e2d2]">رقم الجوال<input value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} autoComplete="tel" inputMode="tel" dir="ltr" className="mt-2 w-full rounded-lg border border-white/10 bg-[#10100d] px-3 py-2.5 text-sm text-white outline-none" placeholder="05xxxxxxxx"/></label>
                <label className="block text-xs font-bold text-[#e9e2d2]">{customerAuthMode==='signup'?'أنشئ كلمة مرور':'كلمة المرور'}<input type="password" minLength={8} autoComplete={customerAuthMode==='signup'?'new-password':'current-password'} value={customerPassword} onChange={e=>setCustomerPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#10100d] px-3 py-2.5 text-sm text-white outline-none" placeholder="8 أحرف على الأقل"/></label>
                {customerAuthMode==='signup' && <label className="block text-xs font-bold text-[#e9e2d2]">تأكيد كلمة المرور<input type="password" minLength={8} autoComplete="new-password" value={customerConfirmPassword} onChange={e=>setCustomerConfirmPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#10100d] px-3 py-2.5 text-sm text-white outline-none" placeholder="أعد كتابة كلمة المرور"/></label>}
                {customerAuthMode==='login' && <a href="/forgot-password" className="inline-block text-[11px] font-bold text-[#f5d66b] underline">نسيت كلمة المرور؟</a>}
                {customerAuthError && <p role="alert" className="rounded-lg bg-red-950/50 p-2.5 text-xs text-red-200">{customerAuthError}</p>}
                <button type="button" disabled={customerAuthBusy} onClick={authenticateCustomer} className="w-full rounded-lg bg-[#f5c542] py-3 text-sm font-black text-[#17140b] disabled:opacity-50">{customerAuthBusy?'جارٍ تجهيز حسابك...':customerAuthMode==='signup'?'إنشاء الحساب والمتابعة':'تسجيل الدخول والمتابعة'}</button>
              </div>
            </div>
          )}
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

      {orderResult && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4"><div className="w-full max-w-md bg-[#f8f6f1] p-8 text-center text-[#201e1a]"><div className="mx-auto flex h-14 w-14 items-center justify-center bg-[#e4eee4] text-[#3f6746]"><Check size={28}/></div><div className="mt-5 text-[10px] font-black tracking-[.2em] text-[#a65e36]">ORDER RECEIVED</div><h2 className="mt-2 text-2xl font-black">وصل طلبك إلى الفرع</h2><p className="mt-2 text-sm text-[#777064]">الطلب الآن بانتظار موافقة الموظف. ستتغير حالته هنا تلقائياً عند المتابعة.</p><div className="mt-5 border border-[#ded8cd] bg-white p-4"><div className="text-xs text-[#777064]">رقم الطلب</div><div className="mt-1 text-3xl font-black tabular-nums">{orderResult.order_number ?? "—"}</div></div><a href={`/orders/${orderResult.id}`} className="mt-5 block w-full bg-[#20201c] py-3.5 text-sm font-bold text-white">تتبع حالة الطلب</a><a href="/account/orders" className="mt-3 block text-xs font-bold text-[#777064]">عرض جميع طلباتي</a><button onClick={()=>setOrderResult(null)} className="mt-3 text-xs font-bold text-[#777064]">العودة للمنيو</button></div></div>}
    </main>
  );
}
