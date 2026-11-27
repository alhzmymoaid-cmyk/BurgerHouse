'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseCustomerBrowserClient } from '@/lib/supabase/client';
import PromoCarousel from '@/components/promo-carousel';
import StorefrontAdminEditor from '@/components/storefront-admin-editor';
import StorefrontMaintenance from '@/components/storefront/storefront-maintenance';
import StorefrontHero from '@/components/storefront/storefront-hero';
import { StorefrontBranchPicker, StorefrontMenu, StorefrontProductSheet, StorefrontCartDrawer } from '@/components/storefront/storefront-commerce';
import {
  ArrowLeft, Check, Clock3, MapPin, Menu, ShoppingBag, X,
  Phone, Navigation, PackageCheck, Utensils, ShieldCheck, Download
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
  const categoryRailRef = useRef<HTMLDivElement | null>(null);
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
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
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
  const siteCopy = catalog?.settings?.published_theme || {};

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
    const rail = categoryRailRef.current;
    if (!rail) return;
    const activeButton = Array.from(rail.querySelectorAll<HTMLButtonElement>('button[data-category-id]'))
      .find((button) => button.dataset.categoryId === activeCategory);
    if (!activeButton) return;
    const railRect = rail.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    const horizontalDelta = buttonRect.left + buttonRect.width / 2 - (railRect.left + rail.clientWidth / 2);
    rail.scrollTo({ left: rail.scrollLeft + horizontalDelta, behavior: 'smooth' });
  }, [activeCategory]);



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



  const detectNearestBranch = async () => {
    setLocationMessage('');
    if (!navigator.geolocation) {
      setLocationMessage('المتصفح لا يدعم تحديد الموقع. اختر الفرع يدويًا.');
      return;
    }
    setLocationBusy(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 120000
        });
      });
      const response = await fetch('/api/branches/nearest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message_ar || 'تعذر تحديد أقرب فرع حاليًا.');
      if (!result.recommended_branch?.id) throw new Error('لم نعثر على فرع مناسب لموقعك. اختر الفرع يدويًا.');
      setBranchId(result.recommended_branch.id);
      setLocationMessage('تم اختيار أقرب فرع: ' + (result.recommended_branch.name_ar || 'الفرع المناسب لموقعك'));
    } catch (error: any) {
      const message = error?.code === 1
        ? 'لم تسمح بالوصول إلى موقعك. فعّل إذن الموقع أو اختر الفرع يدويًا.'
        : error?.code === 3
          ? 'انتهت مهلة تحديد الموقع. حاول مرة أخرى أو اختر الفرع يدويًا.'
          : error?.message || 'تعذر تحديد موقعك. اختر الفرع يدويًا.';
      setLocationMessage(message);
    } finally {
      setLocationBusy(false);
    }
  };

  if (catalog?.settings && (catalog.settings.site_online === false || catalog.settings.maintenance_mode === true)) {
    return (
      <StorefrontMaintenance
        siteOnline={catalog.settings.site_online !== false}
        message={catalog.settings.maintenance_message_ar || 'نعتذر عن استقبال الطلبات حاليًا. نعود إليكم قريبًا.'}
      />
    );
  }

  return (
    <main className={`bh-storefront min-h-screen pb-[env(safe-area-inset-bottom)] bg-[#09090B] text-[#FAFAFA] ${cartCount > 0 ? 'bh-has-cart-items' : ''}`} dir="rtl">
      <StorefrontAdminEditor />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#09090B]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="bh-storefront-announcement bg-[#09090B] px-4 py-2 text-center text-[11px] font-semibold tracking-wide text-[#e9e2d5] sm:text-xs">
          {siteCopy.announcementAr || 'تحضير طازج عند الطلب • استلام مباشر من فروعنا'}
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
        <StorefrontHero
          copy={siteCopy}
          onStartOrder={() => document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth' })}
        />



        <StorefrontBranchPicker branches={branches} branchId={branchId} activeBranch={activeBranch} locationBusy={locationBusy} locationMessage={locationMessage} onBranchChange={(id)=>{setBranchId(id);setLocationMessage('');}} onDetectLocation={detectNearestBranch} />

        <PromoCarousel banners={catalog?.promo_banners || []} branchId={branchId} products={products} onOpenProduct={(product) => openProduct(product as Product)} onSelectCategory={setActiveCategory} />

        <StorefrontMenu
          categories={categories}
          groups={categoryGroups}
          loading={loading}
          error={catalogError}
          activeCategory={activeCategory}
          search={search}
          showFavoritesOnly={showFavoritesOnly}
          favoriteIds={favoriteIds}
          favoriteBusy={favoriteBusy}
          branchId={branchId}
          activeBranch={activeBranch}
          railRef={categoryRailRef}
          basePrice={(product)=>Number(catalog?.branch_overrides?.find((entry:any)=>entry.branch_id===branchId&&entry.product_id===product.id)?.custom_base_price ?? product.base_price)}
          onCategory={setActiveCategory}
          onSearch={setSearch}
          onToggleFavorites={()=>setShowFavoritesOnly(value=>!value)}
          onToggleFavorite={(id)=>void toggleFavorite(id)}
          onOpenProduct={openProduct}
        />
      


      </>}

      {activeView === 'branches' && <section className="bh-branches-page mx-auto min-h-[65vh] max-w-7xl px-4 py-14 lg:px-8">
        <div className="text-[10px] font-black tracking-[.24em] text-[#a65e36]">OUR LOCATIONS</div><h1 className="mt-2 text-4xl font-black">فروعنا</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[#777064]">اختر الفرع المناسب لاستلام طلبك. تختلف ساعات العمل والتوفر حسب الفرع.</p>
        <div className="mt-9 grid gap-5 md:grid-cols-2">{branches.filter((branch)=>branch.is_active).map((branch)=> <article key={branch.id} className="bh-branch-card border border-[#ded8cd] bg-[#fbfaf7] p-6">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{branch.name_ar}</h2><p className="mt-2 text-sm leading-7 text-[#777064]">{branch.address_ar}</p></div><span className={branch.is_accepting_orders?'bh-branch-status is-open bg-[#e5eee5] px-3 py-1 text-[10px] font-bold text-[#426348]':'bh-branch-status is-closed bg-[#eee8e1] px-3 py-1 text-[10px] font-bold text-[#8a6b54]'}>{branch.is_accepting_orders?'يستقبل الطلبات':'متوقف مؤقتاً'}</span></div>
          <div className="mt-5 flex flex-wrap gap-4 border-t border-[#e4ded4] pt-4 text-xs text-[#6d665b]"><span className="flex items-center gap-1.5"><Clock3 size={14}/> {branch.open_time} – {branch.close_time}</span><span className="flex items-center gap-1.5"><Phone size={14}/> {branch.phone || '—'}</span></div>
          <div className="bh-branch-actions mt-5 flex gap-2"><button onClick={()=>{setBranchId(branch.id);setActiveView('menu');window.scrollTo({top:0,behavior:'smooth'});}} className="bg-[#20201c] px-4 py-2.5 text-xs font-bold text-white">استلام من هذا الفرع</button>{branch.map_url&&<a href={branch.map_url} target="_blank" rel="noreferrer" className="border border-[#d8d0c4] px-4 py-2.5 text-xs font-bold"><Navigation size={13}/> الاتجاهات</a>}</div>
        </article>)}</div>
      </section>}



      <footer className="bg-[#20201c] text-[#d6d0c5]">
        <div className="mx-auto grid max-w-7xl gap-9 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div><div className="flex items-center gap-3"><img src="/brand-mark.svg" alt="" className="h-10 w-10"/><div><div className="text-lg font-black tracking-[.12em] text-white">BURGER HOUSE</div><div className="text-[9px] tracking-[.2em] text-[#c5a27e]">CRAFTED OVER FIRE</div></div></div><p className="mt-3 max-w-xs text-xs leading-7 text-[#aaa397]">{siteCopy.footerDescriptionAr || 'نكهات صُنعت على اللهب، ومكونات نختارها بعناية. اطلب مسبقاً واستلم من الفرع.'}</p></div>
          <div><div className="text-xs font-black text-white">تصفح</div><div className="mt-4 space-y-3 text-xs text-[#aaa397]"><button onClick={()=>setActiveView('menu')} className="block">المنيو</button><button onClick={()=>setActiveView('branches')} className="block">فروعنا</button><a href="/account/orders" className="block">طلباتي</a></div></div>
          <div><div className="text-xs font-black text-white">الاستلام</div><p className="mt-4 text-xs leading-7 text-[#aaa397]">جميع الطلبات عبر الموقع مخصصة للاستلام من الفرع فقط. لا نوفر التوصيل المنزلي حالياً.</p></div>
          <div><div className="text-xs font-black text-white">تواصل معنا</div><p className="mt-4 text-xs leading-7 text-[#aaa397]">{catalog?.settings?.support_phone || 'يسعدنا استقبال استفساراتكم عبر فروعنا.'}</p><a href="/account" className="mt-4 inline-block text-xs font-bold text-[#c28b60]">حساب العميل <ArrowLeft className="mr-1 inline" size={13}/></a></div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-[10px] text-[#827d73]">© {new Date().getFullYear()} BURGER HOUSE. جميع الحقوق محفوظة.</div>
      </footer>

      <StorefrontProductSheet
        product={selectedProduct}
        sizes={selectedProduct?.sizes || []}
        addons={addons}
        selectedSize={selectedSize}
        selectedAddons={selectedAddons}
        quantity={quantity}
        note={itemNote}
        basePrice={selectedProduct ? Number(catalog?.branch_overrides?.find((entry:any)=>entry.branch_id===branchId&&entry.product_id===selectedProduct.id)?.custom_base_price ?? selectedProduct.base_price) + Number(selectedProduct.sizes?.find(size=>size.id===selectedSize)?.price_delta || 0) : 0}
        addonPrice={selectedAddons.reduce((sum,id)=>sum+Number(addonFor(id)?.price||0),0)}
        onClose={()=>setSelectedProduct(null)}
        onSize={setSelectedSize}
        onAddons={setSelectedAddons}
        onQuantity={setQuantity}
        onNote={setItemNote}
        onAdd={addToCart}
      />

      <StorefrontCartDrawer
        open={cartOpen}
        cart={cart}
        count={cartCount}
        subtotal={subtotal}
        vat={vat}
        total={total}
        suggested={availableProducts.filter(product=>(product.category_id==='cat-sides'||product.category_id==='cat-drinks')&&!cart.some(line=>line.product.id===product.id)).slice(0,4).length ? availableProducts.filter(product=>(product.category_id==='cat-sides'||product.category_id==='cat-drinks')&&!cart.some(line=>line.product.id===product.id)).slice(0,4) : availableProducts.filter(product=>!cart.some(line=>line.product.id===product.id)).slice(0,4)}
        linePrice={linePrice}
        addonName={(id)=>addonFor(id)?.name_ar}
        onClose={()=>setCartOpen(false)}
        onQuantity={updateQuantity}
        onCheckout={()=>{setCartOpen(false);setCheckoutOpen(true);}}
        onOpenSuggested={(product)=>{setCartOpen(false);openProduct(product);}}
      />

      {checkoutOpen && <div className="bh-checkout-overlay fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={()=>setCheckoutOpen(false)}><div className="bh-checkout-dialog max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-[#171713] p-5 text-[#f7f3e9] shadow-2xl sm:rounded-2xl sm:p-7" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 pb-4"><div><span className="text-[10px] font-black tracking-[.18em] text-[#f5c542]">FINAL STEP</span><div className="mt-1 text-xl font-black text-white">إتمام الطلب</div><div className="mt-1 text-xs text-[#aaa493]">راجع بياناتك وفرع الاستلام قبل التأكيد.</div></div><button onClick={()=>setCheckoutOpen(false)} aria-label="إغلاق إتمام الطلب" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10"><X/></button></div>
        <div className="mt-5 space-y-4">
          <section className="rounded-xl border border-white/10 bg-[#202019] p-4">
            <label className="mb-2 block text-xs font-bold text-[#e9e2d2]" htmlFor="bh-coupon">رمز الخصم</label>
            <div className="flex gap-2"><input id="bh-coupon" value={couponCode} onChange={e=>{setCouponCode(e.target.value.toUpperCase());setCouponPreview(null);}} placeholder="أدخل رمز الخصم" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#10100d] px-3 py-3 text-sm text-white outline-none" dir="ltr"/><button type="button" disabled={couponBusy||!couponCode.trim()} onClick={()=>void validateCoupon()} className="rounded-lg bg-[#E76F32] px-4 text-xs font-black text-white disabled:opacity-50">{couponBusy?'جارٍ التحقق':'تطبيق'}</button></div>
            {couponPreview && <p className="mt-2 text-xs font-bold text-emerald-300">تم تطبيق {couponPreview.code}{couponPreview.description_ar ? ` · ${couponPreview.description_ar}` : ''} — خصم {money(discountAmount)} ر.س</p>}
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
