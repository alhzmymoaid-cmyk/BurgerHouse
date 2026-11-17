'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  INITIAL_BRANCHES,
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_ADDONS,
  INITIAL_BRANCH_OVERRIDES,
  INITIAL_PAYMENT_METHODS,
  resolveBranchesForCheckout,
  calculateVerifiedOrderPricing,
  validateAndNormalizeSaudiPhone,
  ORDER_STATUS_META
} from '@/lib/domain/core-engine.mjs';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function BurgerHouseStorefrontPage() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [activeTab, setActiveTab] = useState<'menu' | 'checkout' | 'track' | 'branches'>('menu');
  const [branches, setBranches] = useState<any[]>(INITIAL_BRANCHES);
  const [categories, setCategories] = useState<any[]>(INITIAL_CATEGORIES);
  const [products, setProducts] = useState<any[]>(INITIAL_PRODUCTS);
  const [addons, setAddons] = useState<any[]>(INITIAL_ADDONS);
  const [branchOverrides, setBranchOverrides] = useState<any[]>(INITIAL_BRANCH_OVERRIDES);
  const [paymentMethods, setPaymentMethods] = useState<any[]>(
    INITIAL_PAYMENT_METHODS.filter((pm) => pm.is_enabled && (!pm.requires_gateway || pm.gateway_configured))
  );
  const [systemSettings, setSystemSettings] = useState<any>({ site_online: true, maintenance_mode: false });

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('br-jed-sultan');
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geoDeclined, setGeoDeclined] = useState<boolean>(false);

  // Product Customization Modal State
  const [customizingProduct, setCustomizingProduct] = useState<any | null>(null);
  const [modalSizeId, setModalSizeId] = useState<string>('');
  const [modalAddonIds, setModalAddonIds] = useState<string[]>([]);
  const [modalQty, setModalQty] = useState<number>(1);
  const [modalNotes, setModalNotes] = useState<string>('');

  const [cart, setCart] = useState<any[]>([
    {
      cart_item_id: 'init-1',
      product_id: 'prd-wagyu-smash',
      size_id: 'sz-wagyu-double',
      quantity: 1,
      addon_ids: ['add-cheddar', 'add-bacon'],
      item_notes: ''
    }
  ]);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('pay_at_pickup_card');
  const [idempotencyKey, setIdempotencyKey] = useState(() => `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [captchaChallenge, setCaptchaChallenge] = useState<any | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  // Secure Order Tracking State (Requires BOTH order_code AND tracking_token)
  const [trackCodeInput, setTrackCodeInput] = useState('');
  const [trackTokenInput, setTrackTokenInput] = useState('');
  const [trackedOrderData, setTrackedOrderData] = useState<any | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // Fetch live catalog from Supabase API on mount
  const loadLiveCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/catalog', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.settings) setSystemSettings(data.settings);
      if (data.branches?.length) setBranches(data.branches);
      if (data.categories?.length) setCategories(data.categories);
      if (data.products?.length) setProducts(data.products);
      if (data.addons?.length) setAddons(data.addons);
      if (data.branch_overrides) setBranchOverrides(data.branch_overrides);
      if (data.payment_methods?.length) {
        const activePms = data.payment_methods.filter(
          (pm: any) => pm.is_enabled && (!pm.requires_gateway || pm.gateway_configured)
        );
        setPaymentMethods(activePms);
        if (activePms[0] && !activePms.some((p: any) => p.id === paymentMethodId)) {
          setPaymentMethodId(activePms[0].id);
        }
      }
    } catch {
      // Uses initial seed if offline
    }
  }, [paymentMethodId]);

  useEffect(() => {
    loadLiveCatalog();
  }, [loadLiveCatalog]);

  // Subscribe to Realtime updates for tracked order
  useEffect(() => {
    if (!trackedOrderData?.order_code || !trackTokenInput) return;
    try {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel(`track-order-${trackedOrderData.order_code}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `order_code=eq.${trackedOrderData.order_code}`
          },
          () => {
            fetchTrackedOrder(trackedOrderData.order_code, trackTokenInput);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      return undefined;
    }
  }, [trackedOrderData?.order_code, trackTokenInput]);

  const branchResolution = useMemo(
    () => resolveBranchesForCheckout(branches, userCoords, new Date()),
    [branches, userCoords]
  );

  useEffect(() => {
    if (branchResolution.recommended_branch) {
      setSelectedBranchId(branchResolution.recommended_branch.id);
    }
  }, [branchResolution]);

  const currentBranch = useMemo(
    () => branchResolution.branches.find((b: any) => b.id === selectedBranchId) || branchResolution.branches[0],
    [branchResolution, selectedBranchId]
  );

  const pricing = useMemo(() => {
    if (cart.length === 0) {
      return { verified_items: [], subtotal: 0, vat_amount: 0, total_amount: 0 };
    }
    try {
      return calculateVerifiedOrderPricing({
        items: cart,
        branchId: selectedBranchId,
        products,
        addons,
        branchOverrides,
        vatPercentage: 15
      });
    } catch {
      return { verified_items: [], subtotal: 0, vat_amount: 0, total_amount: 0 };
    }
  }, [cart, selectedBranchId, products, addons, branchOverrides]);

  const handleRequestGeolocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoDeclined(false);
          setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        () => {
          setGeoDeclined(true);
          setUserCoords(null);
        }
      );
    }
  };

  const openCustomizeModal = (product: any) => {
    setCustomizingProduct(product);
    const defSize = product.sizes?.find((s: any) => s.is_default) || product.sizes?.[0];
    setModalSizeId(defSize?.id || '');
    setModalAddonIds([]);
    setModalQty(1);
    setModalNotes('');
  };

  const confirmAddCustomizedItem = () => {
    if (!customizingProduct) return;
    setCart((prev) => [
      ...prev,
      {
        cart_item_id: `ci-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        product_id: customizingProduct.id,
        size_id: modalSizeId,
        quantity: modalQty,
        addon_ids: modalAddonIds,
        item_notes: modalNotes.trim()
      }
    ]);
    setCustomizingProduct(null);
  };

  const fetchTrackedOrder = async (code: string, token: string) => {
    setTrackingError(null);
    try {
      const res = await fetch('/api/orders/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          order_code: code.trim(),
          tracking_token: token.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setTrackingError(data.message_ar || 'تعذر التحقق من رقم الطلب أو رمز التتبع الأمني.');
        return;
      }
      setTrackedOrderData(data);
    } catch (err: any) {
      setTrackingError(err?.message || 'حدث خطأ أثناء الاتصال بالخادم');
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!currentBranch?.is_currently_open) {
      setErrorMessage(
        lang === 'ar'
          ? 'الفرع المختار مغلق حالياً أو لا يستقبل الطلبات. يرجى اختيار فرع مفتوح.'
          : 'Selected branch is currently closed. Please choose an open branch.'
      );
      return;
    }

    const phoneValidation = validateAndNormalizeSaudiPhone(customerPhone);
    if (!phoneValidation.valid) {
      setErrorMessage(
        lang === 'ar'
          ? 'يرجى إدخال رقم جوال سعودي صحيح وغير وهمي (مثال: 0535717670)'
          : 'Please enter a valid Saudi mobile number (e.g. 0535717670)'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({
          branch_id: selectedBranchId,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_notes: customerNotes,
          payment_method_id: paymentMethodId,
          items: cart,
          website_url_honeypot: honeypot,
          captcha_token: captchaChallenge?.token || null,
          captcha_answer: captchaAnswer || null
        })
      });

      const data = await res.json();
      if (res.status === 428 && data.error === 'CAPTCHA_REQUIRED') {
        setCaptchaChallenge(data.challenge);
        setErrorMessage(
          lang === 'ar'
            ? 'لحماية الطلب من الطلبات الوهمية، يرجى الإجابة على سؤال التحقق الأمني.'
            : 'Please complete the anti-bot security challenge.'
        );
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        setErrorMessage(data.message || data.error || 'تعذر إتمام الطلب');
        setSubmitting(false);
        return;
      }

      // Order created atomically in Supabase! Save order_code + tracking_token for privacy-safe tracking
      setTrackCodeInput(data.order_code);
      setTrackTokenInput(data.tracking_token);
      setTrackedOrderData({
        ...data,
        customer_name_masked: data.customer_name ? data.customer_name.slice(0, 1) + '***' : '***',
        customer_phone_masked: data.customer_phone
          ? data.customer_phone.slice(0, 5) + '****' + data.customer_phone.slice(-3)
          : '****'
      });
      setCart([]);
      setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
      setCaptchaChallenge(null);
      setCaptchaAnswer('');
      setActiveTab('track');
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ في الشبكة');
    } finally {
      setSubmitting(false);
    }
  };

  if (!systemSettings.site_online || systemSettings.maintenance_mode) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#0B0A09] p-6 text-center text-[#F5EFE6]">
        <div className="max-w-lg rounded-3xl border border-amber-500/40 bg-[#141210] p-10 shadow-2xl space-y-4">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-2xl font-extrabold text-[#D49A3A]">
            {!systemSettings.site_online ? 'الموقع متوقف مؤقتاً' : 'الموقع في وضع الصيانة'}
          </h1>
          <p className="text-sm text-[#9E9488]">
            {systemSettings.maintenance_message_ar || 'نحن نقوم بتحديث أنظمتنا لتقديم تجربة أفضل. نعود إليكم قريباً.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0B0A09] text-[#F5EFE6]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B0A09]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#D49A3A] to-[#B84A27] font-black text-[#0B0A09]">
              BH
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-wider text-[#F5EFE6]">BURGER HOUSE</h1>
              <p className="text-xs text-[#D49A3A]">
                {lang === 'ar' ? 'برجر هاوس — واغيو أسترالي مدخن على اللهب' : 'ARTISAN FIRE-CRAFTED WAGYU'}
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <button onClick={() => setActiveTab('menu')} className={`rounded-xl px-3.5 py-2 text-xs font-bold ${activeTab === 'menu' ? 'bg-[#D49A3A] text-[#0B0A09]' : 'hover:bg-white/5'}`}>
              {lang === 'ar' ? 'المنيو الفاخر' : 'Menu'}
            </button>
            <button onClick={() => setActiveTab('checkout')} className={`rounded-xl px-3.5 py-2 text-xs font-bold ${activeTab === 'checkout' ? 'bg-[#D49A3A] text-[#0B0A09]' : 'hover:bg-white/5'}`}>
              {lang === 'ar' ? `السلة والدفع (${cart.length})` : `Checkout (${cart.length})`}
            </button>
            <button onClick={() => setActiveTab('track')} className={`rounded-xl px-3.5 py-2 text-xs font-bold ${activeTab === 'track' ? 'bg-[#D49A3A] text-[#0B0A09]' : 'hover:bg-white/5'}`}>
              {lang === 'ar' ? 'تتبع الطلب الآمن' : 'Track Order'}
            </button>
            <button onClick={() => setActiveTab('branches')} className={`rounded-xl px-3.5 py-2 text-xs font-bold ${activeTab === 'branches' ? 'bg-[#D49A3A] text-[#0B0A09]' : 'hover:bg-white/5'}`}>
              {lang === 'ar' ? 'الفروع والتواصل' : 'Branches'}
            </button>
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="rounded-xl border border-[#D49A3A]/40 px-3 py-1.5 text-xs font-bold text-[#D49A3A]"
            >
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {activeTab === 'menu' && (
          <section className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#141210] p-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`rounded-xl px-4 py-2 text-xs font-bold ${selectedCategory === 'all' ? 'bg-[#D49A3A] text-[#0B0A09]' : 'bg-[#0B0A09] text-[#9E9488]'}`}
                >
                  {lang === 'ar' ? 'الكل' : 'All'}
                </button>
                {categories.map((cat: any) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`rounded-xl px-4 py-2 text-xs font-bold ${selectedCategory === cat.id ? 'bg-[#D49A3A] text-[#0B0A09]' : 'bg-[#0B0A09] text-[#9E9488]'}`}
                  >
                    {lang === 'ar' ? cat.name_ar : cat.name_en}
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === 'ar' ? 'ابحث في المنيو...' : 'Search menu...'}
                className="rounded-xl border border-white/15 bg-[#0B0A09] px-4 py-2 text-xs text-[#F5EFE6]"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {products
                .filter((p) => (selectedCategory === 'all' ? true : p.category_id === selectedCategory))
                .filter((p) =>
                  searchQuery
                    ? p.name_ar.includes(searchQuery) || p.name_en.toLowerCase().includes(searchQuery.toLowerCase())
                    : true
                )
                .map((product) => {
                  const override = branchOverrides.find(
                    (o: any) => o.branch_id === selectedBranchId && o.product_id === product.id
                  );
                  const displayPrice =
                    override && typeof override.custom_base_price === 'number'
                      ? override.custom_base_price
                      : product.base_price;

                  return (
                    <div
                      key={product.id}
                      className="overflow-hidden rounded-3xl border border-white/10 bg-[#141210] transition hover:border-[#D49A3A]/50 flex flex-col justify-between"
                    >
                      <div>
                        <img src={product.image_url} alt={product.name_ar} className="h-56 w-full object-cover" />
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-lg font-bold text-[#F5EFE6]">
                              {lang === 'ar' ? product.name_ar : product.name_en}
                            </h3>
                            <span className="rounded-xl bg-[#D49A3A]/15 px-3 py-1 text-sm font-extrabold text-[#D49A3A]">
                              {displayPrice} {lang === 'ar' ? 'ر.س' : 'SAR'}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-[#9E9488]">
                            {lang === 'ar' ? product.description_ar : product.description_en}
                          </p>
                        </div>
                      </div>
                      <div className="p-5 pt-0">
                        <button
                          onClick={() => openCustomizeModal(product)}
                          className="w-full rounded-xl bg-[#D49A3A] py-2.5 text-xs font-extrabold text-[#0B0A09] transition hover:bg-[#e3ab4c]"
                        >
                          {lang === 'ar' ? 'تخصيص الحجم والإضافات +' : 'Customize & Add +'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {activeTab === 'checkout' && (
          <form onSubmit={handleSubmitOrder} className="grid gap-8 lg:grid-cols-12">
            <div className="space-y-6 rounded-3xl border border-white/10 bg-[#141210] p-6 lg:col-span-7">
              <h2 className="text-xl font-bold text-[#D49A3A]">
                {lang === 'ar' ? '١. فرع الاستلام (Pickup Only)' : '1. Pickup Branch Selection'}
              </h2>
              <button
                type="button"
                onClick={handleRequestGeolocation}
                className="w-full rounded-xl border border-[#D49A3A]/50 bg-[#D49A3A]/10 py-2.5 text-xs font-bold text-[#D49A3A]"
              >
                {lang === 'ar' ? '📍 تحديد أقرب فرع مفتوح تلقائياً عبر موقعي الجغرافي' : '📍 Detect Nearest Open Branch via GPS'}
              </button>

              {branchResolution.skipped_closed_nearest_branch && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
                  تنبيه ذكي: أقرب فرع لموقعك ({branchResolution.skipped_closed_nearest_branch.name_ar}) مغلق حالياً، لذا تم اختيار أقرب فرع مفتوح تلقائياً ({branchResolution.recommended_branch?.name_ar}).
                </div>
              )}

              {geoDeclined && (
                <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-[#9E9488]">
                  تم رفض إذن الموقع الجغرافي — نعرض لك جميع الفروع المتاحة لتختار منها يدوياً.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {branchResolution.branches.map((b: any) => (
                  <label
                    key={b.id}
                    className={`flex cursor-pointer flex-col justify-between rounded-2xl border p-4 ${
                      selectedBranchId === b.id ? 'border-[#D49A3A] bg-[#D49A3A]/10' : 'border-white/10 bg-[#1C1916]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold">{lang === 'ar' ? b.name_ar : b.name_en}</span>
                        <input
                          type="radio"
                          name="branch"
                          checked={selectedBranchId === b.id}
                          onChange={() => setSelectedBranchId(b.id)}
                        />
                      </div>
                      <div className="mt-1 text-xs text-[#9E9488]">{lang === 'ar' ? b.address_ar : b.address_en}</div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-[#D49A3A]">
                      <span>{b.distance_km !== null ? `${b.distance_km} كم • ` : ''}{b.phone}</span>
                      <span className={b.is_currently_open ? 'text-emerald-400' : 'text-red-400'}>
                        {b.is_currently_open ? 'مفتوح' : 'مغلق'}
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              <h2 className="text-xl font-bold text-[#D49A3A]">
                {lang === 'ar' ? '٢. بيانات العميل ووسيلة الدفع المعتمدة' : '2. Customer & Active Payment Method'}
              </h2>
              <input
                type="text"
                required
                placeholder={lang === 'ar' ? 'الاسم الكامل للمستلم' : 'Full Name'}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#1C1916] px-4 py-3 text-sm"
              />
              <input
                type="tel"
                required
                dir="ltr"
                placeholder={lang === 'ar' ? 'رقم الجوال السعودي (05XXXXXXXX)' : 'Saudi Mobile (05XXXXXXXX)'}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#1C1916] px-4 py-3 text-sm"
              />
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="hidden"
                aria-hidden="true"
              />
              <textarea
                placeholder={lang === 'ar' ? 'ملاحظات التحضير أو الاستلام' : 'Order Notes'}
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#1C1916] px-4 py-3 text-sm"
              />

              <div className="space-y-2">
                <div className="text-xs font-bold text-[#9E9488]">
                  وسيلة الدفع المتاحة فعلياً (وسائل الدفع الإلكتروني غير المربوطة ببوابة دفع معطلة ومخفية):
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {paymentMethods.map((pm: any) => (
                    <label
                      key={pm.id}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 text-xs font-bold ${
                        paymentMethodId === pm.id ? 'border-[#D49A3A] bg-[#D49A3A]/15' : 'border-white/10 bg-[#1C1916]'
                      }`}
                    >
                      <span>{lang === 'ar' ? pm.name_ar : pm.name_en}</span>
                      <input
                        type="radio"
                        name="payment_method"
                        checked={paymentMethodId === pm.id}
                        onChange={() => setPaymentMethodId(pm.id)}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {captchaChallenge && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
                  <p className="text-xs font-bold text-amber-300">
                    {lang === 'ar' ? captchaChallenge.question_ar : captchaChallenge.question_en}
                  </p>
                  <input
                    type="text"
                    required
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-[#0B0A09] px-3 py-2 text-sm"
                  />
                </div>
              )}

              {errorMessage && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs font-bold text-red-300">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || cart.length === 0}
                className="w-full rounded-xl bg-[#D49A3A] py-3.5 text-sm font-black text-[#0B0A09] disabled:opacity-50"
              >
                {submitting
                  ? 'جاري التنفيذ الذري في قاعدة البيانات...'
                  : lang === 'ar'
                  ? `تأكيد طلب الاستلام (${pricing.total_amount} ر.س)`
                  : `Confirm Pickup Order (${pricing.total_amount} SAR)`}
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#141210] p-6 lg:col-span-5 h-fit space-y-4">
              <h3 className="text-lg font-extrabold text-[#F5EFE6]">ملخص الطلب (إعادة حساب الخادم)</h3>
              <div className="space-y-2 text-xs">
                {pricing.verified_items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between border-b border-white/10 pb-2">
                    <span>{item.quantity}× {item.product_name_ar} ({item.size_name_ar})</span>
                    <span className="font-bold text-[#D49A3A]">{item.line_total} ر.س</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1 text-sm border-t border-white/10 pt-3">
                <div className="flex justify-between text-[#9E9488]">
                  <span>المجموع الفرعي:</span>
                  <span>{pricing.subtotal} ر.س</span>
                </div>
                <div className="flex justify-between text-[#9E9488]">
                  <span>ضريبة القيمة المضافة (15%):</span>
                  <span>{pricing.vat_amount} ر.س</span>
                </div>
                <div className="flex justify-between text-base font-black text-[#D49A3A] pt-1">
                  <span>الإجمالي النهائي:</span>
                  <span>{pricing.total_amount} ر.س</span>
                </div>
              </div>
            </div>
          </form>
        )}

        {activeTab === 'track' && (
          <section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#141210] p-6 space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-[#D49A3A]">متابعة حالة الطلب الآمنة (Privacy-Safe Order Tracking)</h2>
              <p className="text-xs text-[#9E9488]">
                لحماية خصوصية العملاء، يتطلب الاستعلام كلاً من رقم الطلب (`BH-XXXX-XXXX`) ورمز التتبع الأمني (`tracking_token`) ولا يكشف البيانات الشخصية للزوار.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                dir="ltr"
                value={trackCodeInput}
                onChange={(e) => setTrackCodeInput(e.target.value)}
                placeholder="رقم الطلب (BH-XXXX-XXXX)"
                className="rounded-xl border border-white/15 bg-[#0B0A09] px-3.5 py-2.5 text-xs font-mono"
              />
              <input
                type="text"
                dir="ltr"
                value={trackTokenInput}
                onChange={(e) => setTrackTokenInput(e.target.value)}
                placeholder="رمز التتبع الأمني (trk_...)"
                className="rounded-xl border border-white/15 bg-[#0B0A09] px-3.5 py-2.5 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => fetchTrackedOrder(trackCodeInput, trackTokenInput)}
                className="rounded-xl bg-[#D49A3A] px-4 py-2.5 text-xs font-black text-[#0B0A09]"
              >
                تحقق وتابع الطلب
              </button>
            </div>

            {trackingError && (
              <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-xs font-bold text-red-300">
                {trackingError}
              </div>
            )}

            {trackedOrderData && (
              <div className="rounded-2xl border border-[#D49A3A]/40 bg-[#0B0A09] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <div className="text-xs text-[#9E9488]">رقم الطلب الموثق:</div>
                    <div className="font-mono text-2xl font-black text-[#D49A3A]">{trackedOrderData.order_code}</div>
                  </div>
                  <span className="rounded-xl bg-[#D49A3A]/20 px-3 py-1.5 text-xs font-extrabold text-[#D49A3A]">
                    {(ORDER_STATUS_META as any)[trackedOrderData.status]?.label_ar || trackedOrderData.status}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 text-xs">
                  <div className="rounded-xl bg-[#141210] p-3.5">
                    <div className="text-[#D49A3A] font-bold">فرع الاستلام الثابت:</div>
                    <div className="font-bold mt-1">{trackedOrderData.branch_snapshot?.name_ar}</div>
                    <div className="text-[#9E9488]">{trackedOrderData.branch_snapshot?.address_ar}</div>
                  </div>
                  <div className="rounded-xl bg-[#141210] p-3.5">
                    <div className="text-[#D49A3A] font-bold">بيانات المستلم (محمية ومقنّعة):</div>
                    <div className="mt-1">العميل: {trackedOrderData.customer_name_masked}</div>
                    <div dir="ltr" className="text-[#9E9488]">{trackedOrderData.customer_phone_masked}</div>
                    <div className="font-bold text-emerald-400 mt-1">الإجمالي: {trackedOrderData.total_amount} ر.س</div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'branches' && (
          <section className="grid gap-6 md:grid-cols-2">
            {branches.map((b: any) => (
              <div key={b.id} className="rounded-3xl border border-white/10 bg-[#141210] p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-extrabold text-[#F5EFE6]">{b.name_ar}</h3>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${b.is_accepting_orders ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                    {b.is_accepting_orders ? 'مفتوح للاستلام' : 'مغلق حالياً'}
                  </span>
                </div>
                <p className="text-xs text-[#9E9488]">{b.address_ar}</p>
                <div className="text-xs text-[#D49A3A]">📞 {b.phone} • 🕒 {b.open_time} - {b.close_time}</div>
              </div>
            ))}
          </section>
        )}
      </main>

      {/* Product Customization Modal */}
      {customizingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#141210] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">{customizingProduct.name_ar}</h3>
              <button onClick={() => setCustomizingProduct(null)} className="text-sm text-[#9E9488]">✕</button>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#D49A3A]">اختر الحجم:</div>
              <div className="grid grid-cols-3 gap-2">
                {(customizingProduct.sizes || []).map((sz: any) => (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => setModalSizeId(sz.id)}
                    className={`rounded-xl border p-2 text-xs font-bold ${modalSizeId === sz.id ? 'border-[#D49A3A] bg-[#D49A3A]/15' : 'border-white/10 bg-[#0B0A09]'}`}
                  >
                    <div>{sz.name_ar}</div>
                    <div className="text-[10px] text-[#D49A3A]">{sz.price_delta >= 0 ? `+${sz.price_delta}` : sz.price_delta} ر.س</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#D49A3A]">الإضافات الاختيارية:</div>
              <div className="space-y-1.5">
                {addons
                  .filter((a: any) => (customizingProduct.allowed_addon_ids || []).includes(a.id))
                  .map((ad: any) => {
                    const selected = modalAddonIds.includes(ad.id);
                    return (
                      <button
                        key={ad.id}
                        type="button"
                        onClick={() =>
                          setModalAddonIds((prev) =>
                            prev.includes(ad.id) ? prev.filter((id) => id !== ad.id) : [...prev, ad.id]
                          )
                        }
                        className={`flex w-full items-center justify-between rounded-xl border p-2.5 text-xs font-bold ${
                          selected ? 'border-[#D49A3A] bg-[#D49A3A]/15' : 'border-white/10 bg-[#0B0A09]'
                        }`}
                      >
                        <span>{ad.name_ar}</span>
                        <span className="text-[#D49A3A]">+{ad.price} ر.س</span>
                      </button>
                    );
                  })}
              </div>
            </div>
            <button
              type="button"
              onClick={confirmAddCustomizedItem}
              className="w-full rounded-xl bg-[#D49A3A] py-3 text-xs font-black text-[#0B0A09]"
            >
              تأكيد الإضافة للسلة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
