import crypto from 'crypto';

// ============================================================================
// 0. ENVIRONMENT SECRET ENFORCEMENT (NO HARDCODED PRODUCTION DEFAULTS)
// ============================================================================

export function getRequiredEnvSecret(envVarName) {
  const val = process.env[envVarName];
  if (!val || typeof val !== 'string' || val.trim().length < 32) {
    throw new Error(
      `MISSING_OR_WEAK_ENV_SECRET: Environment variable ${envVarName} must be set and at least 32 characters long.`
    );
  }
  return val.trim();
}

export function hashClientIdentifier(rawValue, secret) {
  const key = secret || getRequiredEnvSecret('ORDER_HMAC_SECRET');
  return crypto
    .createHmac('sha256', key)
    .update(String(rawValue || 'unknown'))
    .digest('hex')
    .slice(0, 32);
}

// ============================================================================
// 1. INITIAL CATALOG & BRANCH SEED DEFINITIONS
// ============================================================================

export const INITIAL_BRANCHES = [
  {
    id: 'br-jed-sultan',
    slug: 'jeddah-prince-sultan',
    name_ar: 'فرع جدة — طريق الأمير سلطان (المحمدية)',
    name_en: 'Jeddah — Prince Sultan Rd (Al Mohammadiyyah)',
    address_ar: 'طريق الأمير سلطان، حي المحمدية، جدة 23625',
    address_en: 'Prince Sultan Road, Al Mohammadiyyah Dist, Jeddah 23625',
    latitude: 21.6679,
    longitude: 39.1215,
    phone: '+966535717670',
    map_url: 'https://www.google.com/maps/search/?api=1&query=21.6679,39.1215',
    open_time: '12:00',
    close_time: '02:00',
    closed_days: [],
    is_active: true,
    is_accepting_orders: true,
    prep_time_minutes: 15,
    pickup_instructions_ar: 'يرجى التوجه إلى كاونتر الاستلام السريع (Express Pickup) وإبراز رقم الطلب.',
    pickup_instructions_en: 'Please proceed to the Express Pickup counter and show your order code.'
  },
  {
    id: 'br-jed-hamra',
    slug: 'jeddah-al-hamra',
    name_ar: 'فرع جدة — كورنيش الحمراء',
    name_en: 'Jeddah — Al Hamra Corniche',
    address_ar: 'طريق الكورنيش، حي الحمراء، جدة 23212',
    address_en: 'Corniche Road, Al Hamra Dist, Jeddah 23212',
    latitude: 21.5242,
    longitude: 39.1531,
    phone: '+966535717671',
    map_url: 'https://www.google.com/maps/search/?api=1&query=21.5242,39.1531',
    open_time: '13:00',
    close_time: '03:00',
    closed_days: [],
    is_active: true,
    is_accepting_orders: true,
    prep_time_minutes: 18,
    pickup_instructions_ar: 'الاستلام من البوابة البحرية الجانبية المخصصة لطلبات الموقع.',
    pickup_instructions_en: 'Pickup from the Seaside Express Desk dedicated to online orders.'
  },
  {
    id: 'br-riy-tahlia',
    slug: 'riyadh-tahlia',
    name_ar: 'فرع الرياض — شارع التحلية (العليا)',
    name_en: 'Riyadh — Tahlia St (Al Olaya)',
    address_ar: 'طريق الأمير محمد بن عبدالعزيز (التحلية)، حي العليا، الرياض 12241',
    address_en: 'Prince Mohammed Bin Abdulaziz Rd (Tahlia St), Al Olaya, Riyadh 12241',
    latitude: 24.6411,
    longitude: 46.7144,
    phone: '+966535717672',
    map_url: 'https://www.google.com/maps/search/?api=1&query=24.6411,46.7144',
    open_time: '12:00',
    close_time: '01:00',
    closed_days: [],
    is_active: true,
    is_accepting_orders: true,
    prep_time_minutes: 15,
    pickup_instructions_ar: 'يرجى التوجه إلى صالة الاستلام بالطابق الأرضي.',
    pickup_instructions_en: 'Please proceed to the Ground Floor Pickup Lounge.'
  },
  {
    id: 'br-jed-obhur',
    slug: 'jeddah-north-obhur',
    name_ar: 'فرع جدة — أبحر الشمالية',
    name_en: 'Jeddah — North Obhur',
    address_ar: 'طريق عابر القارات، أبحر الشمالية، جدة 23814',
    address_en: 'North Obhur Coastal Road, Jeddah 23814',
    latitude: 21.7425,
    longitude: 39.0882,
    phone: '+966535717673',
    map_url: 'https://www.google.com/maps/search/?api=1&query=21.7425,39.0882',
    open_time: '18:00',
    close_time: '02:00',
    closed_days: [],
    is_active: true,
    is_accepting_orders: false,
    prep_time_minutes: 20,
    pickup_instructions_ar: 'مكتب الاستلام الخارجي بجوار التراس البحري.',
    pickup_instructions_en: 'Outdoor pickup desk next to the sea terrace.'
  }
];

export const INITIAL_CATEGORIES = [
  { id: 'cat-wagyu', name_ar: 'برجر الواغيو الفاخر', name_en: 'Artisan Wagyu Burgers', sort_order: 1, is_active: true },
  { id: 'cat-chicken', name_ar: 'برجر الدجاج المقرمش', name_en: 'Crispy Chicken Burgers', sort_order: 2, is_active: true },
  { id: 'cat-sides', name_ar: 'البطاطس والمقبلات', name_en: 'Artisan Sides & Fries', sort_order: 3, is_active: true },
  { id: 'cat-drinks', name_ar: 'الميلك شيك والمشروبات', name_en: 'Craft Shakes & Drinks', sort_order: 4, is_active: true }
];

export const INITIAL_ADDONS = [
  { id: 'add-cheddar', name_ar: 'شريحة شيدر إنجليزي معتق ١٨ شهراً', name_en: '18-Month Aged English Cheddar', price: 5, is_active: true, max_per_item: 3 },
  { id: 'add-bacon', name_ar: 'بيكون بقري مدخن بحطب التفاح', name_en: 'Applewood Smoked Beef Bacon', price: 8, is_active: true, max_per_item: 2 },
  { id: 'add-truffle-sauce', name_ar: 'صوص ترافل أيولي الأسود الخاص', name_en: 'House Black Truffle Aioli Dip', price: 6, is_active: true, max_per_item: 3 },
  { id: 'add-jalapeno', name_ar: 'هلابينو مشوي ومخلل', name_en: 'Charred Pickled Jalapeños', price: 4, is_active: true, max_per_item: 2 },
  { id: 'add-patty', name_ar: 'شريحة واغيو إضافية (١٥٠ جرام)', name_en: 'Extra 150g Wagyu Smash Patty', price: 16, is_active: true, max_per_item: 2 }
];

export const INITIAL_PRODUCTS = [
  {
    id: 'prd-wagyu-smash',
    category_id: 'cat-wagyu',
    name_ar: 'واغيو سماش ريزيرف المزدوج',
    name_en: 'Double Smashed Wagyu Reserve',
    description_ar: 'شريحتان من لحم الواغيو الأسترالي الفاخر (درجة الترخيم MB7+) مكرملة على الصاج الحديدي، جبن شيدر معتق، بيكون بقري مدخن، بصل مكرمل ببطء، وصوص برجر هاوس المدخن في خبز بريوش محمص بالزبدة.',
    description_en: 'Two caramelized Australian MB7+ Wagyu smash patties, aged English cheddar, crispy beef bacon, slow-braised onions, and smoky house glaze on a butter-toasted artisan brioche bun.',
    base_price: 48,
    calories: 840,
    prep_minutes: 12,
    image_url: '/images/hero-wagyu-smash.jpg',
    is_featured: true,
    is_active: true,
    sizes: [
      { id: 'sz-wagyu-single', name_ar: 'سنقل — شريحة واحدة (١٥٠غ)', name_en: 'Single — 150g Patty', price_delta: -10, is_default: false },
      { id: 'sz-wagyu-double', name_ar: 'دبل — شريحتان (٣٠٠غ)', name_en: 'Double — 300g Patties', price_delta: 0, is_default: true },
      { id: 'sz-wagyu-triple', name_ar: 'تربل — ٣ شرائح (٤٥٠غ)', name_en: 'Triple — 450g Patties', price_delta: 14, is_default: false }
    ],
    allowed_addon_ids: ['add-cheddar', 'add-bacon', 'add-truffle-sauce', 'add-jalapeno', 'add-patty']
  },
  {
    id: 'prd-truffle-swiss',
    category_id: 'cat-wagyu',
    name_ar: 'بلاك ترافل واغيو والفطر البري',
    name_en: 'Black Truffle & Wild Mushroom Wagyu',
    description_ar: 'لحم واغيو صافي مشوي على اللهب، جبن غرويير السويسري الذائب، فطر بورتوبيلو وشيتاكي محمص بالزبدة والثوم، شرائح الكمأة السوداء الإيطالية وصوص ترافل أيولي.',
    description_en: 'Flame-seared Wagyu patty, melted Swiss Gruyère, garlic-butter roasted portobello & shiitake mushrooms, shaved Italian black truffle, and house truffle aioli.',
    base_price: 54,
    calories: 790,
    prep_minutes: 14,
    image_url: '/images/truffle-mushroom-wagyu.jpg',
    is_featured: true,
    is_active: true,
    sizes: [
      { id: 'sz-truffle-single', name_ar: 'سنقل — شريحة واحدة (١٥٠غ)', name_en: 'Single — 150g Patty', price_delta: -10, is_default: false },
      { id: 'sz-truffle-double', name_ar: 'دبل — شريحتان (٣٠٠غ)', name_en: 'Double — 300g Patties', price_delta: 0, is_default: true },
      { id: 'sz-truffle-triple', name_ar: 'تربل — ٣ شرائح (٤٥٠غ)', name_en: 'Triple — 450g Patties', price_delta: 14, is_default: false }
    ],
    allowed_addon_ids: ['add-cheddar', 'add-bacon', 'add-truffle-sauce', 'add-patty']
  },
  {
    id: 'prd-smoked-brisket',
    category_id: 'cat-wagyu',
    name_ar: 'برجر البريسكت المدخن ١٢ ساعة',
    name_en: '12-Hour Smoked Brisket & Gouda Burger',
    description_ar: 'شرائح بريسكت الصدر البقري المدخن لمدة ١٢ ساعة بحطب البلوط فوق شريحة واغيو، جبن غودا المدخن، حلقات بصل مقرمشة، وصوص هيكوري باربيكيو المعتق.',
    description_en: '12-hour oak-smoked beef brisket slices stacked over a Wagyu patty, melted smoked Gouda, crispy artisan onion rings, and aged hickory BBQ glaze.',
    base_price: 58,
    calories: 920,
    prep_minutes: 15,
    image_url: '/images/smoked-brisket-burger.jpg',
    is_featured: true,
    is_active: true,
    sizes: [
      { id: 'sz-brisket-std', name_ar: 'حجم كلاسيك (٢٥٠غ لحم)', name_en: 'Classic Stack (250g Meat)', price_delta: 0, is_default: true },
      { id: 'sz-brisket-pit', name_ar: 'حجم بيت ماستر المضاعف (٤٠٠غ)', name_en: 'Pitmaster Double Stack (400g)', price_delta: 16, is_default: false }
    ],
    allowed_addon_ids: ['add-cheddar', 'add-bacon', 'add-jalapeno', 'add-patty']
  },
  {
    id: 'prd-nashville-chicken',
    category_id: 'cat-chicken',
    name_ar: 'ناشفيل الدجاج المقرمش بالعسل الحار',
    name_en: 'Crispy Nashville Hot Honey Chicken',
    description_ar: 'صدر دجاج طازج متبل ٢٤ ساعة باللبن الرائب ومقلي بقرمشة ذهبية، مغطى بزبدة العسل الحار البري، سلطة كول سلو بالتفاح الأخضر، ومخلل الشبت الفاخر.',
    description_en: '24-hour buttermilk brined crispy chicken breast glazed with wild hot honey butter, crisp green apple slaw, and house dill pickles on a toasted potato bun.',
    base_price: 39,
    calories: 710,
    prep_minutes: 12,
    image_url: '/images/nashville-hot-chicken.jpg',
    is_featured: false,
    is_active: true,
    sizes: [
      { id: 'sz-chick-1', name_ar: 'فيليه مفرد', name_en: 'Single Fillet', price_delta: 0, is_default: true },
      { id: 'sz-chick-2', name_ar: 'فيليه مزدوج', name_en: 'Double Fillet', price_delta: 12, is_default: false }
    ],
    allowed_addon_ids: ['add-cheddar', 'add-bacon', 'add-truffle-sauce', 'add-jalapeno']
  },
  {
    id: 'prd-loaded-fries',
    category_id: 'cat-sides',
    name_ar: 'بطاطس الشيدر المعتق والبيكون المدخن',
    name_en: 'Artisan Truffle & Aged Cheddar Bacon Fries',
    description_ar: 'بطاطس ريفية مقطعة يدوياً بقشرتها ومقلية مرتين للقرمشة القصوى، مغطاة بصوص جبن الشيدر الإنجليزي الدافئ، فتات البيكون البقري المدخن، والثوم المعمر الطازج.',
    description_en: 'Twice-cooked skin-on hand-cut fries smothered in warm aged English cheddar sauce, crispy smoked beef bacon bits, and fresh snipped chives.',
    base_price: 26,
    calories: 580,
    prep_minutes: 8,
    image_url: '/images/loaded-cheddar-fries.jpg',
    is_featured: false,
    is_active: true,
    sizes: [
      { id: 'sz-fries-reg', name_ar: 'حجم فردي', name_en: 'Regular Bowl', price_delta: 0, is_default: true },
      { id: 'sz-fries-share', name_ar: 'حجم عائلي للمشاركة', name_en: 'Sharing Platter', price_delta: 10, is_default: false }
    ],
    allowed_addon_ids: ['add-bacon', 'add-truffle-sauce', 'add-jalapeno']
  },
  {
    id: 'prd-salted-shake',
    category_id: 'cat-drinks',
    name_ar: 'ميلك شيك الشوكولاتة البلجيكية والكراميل المملح',
    name_en: 'Belgian Dark Chocolate & Salted Caramel Shake',
    description_ar: 'آيس كريم الفانيليا المدغشقرية المخفوق يدوياً مع الشوكولاتة البلجيكية الداكنة ٧٠٪، كراميل مملح بملح البحر الفرنسي، وكريمة مخفوقة طازجة.',
    description_en: 'Hand-spun Madagascar vanilla bean gelato blended with 70% Belgian dark chocolate, French fleur de sel caramel drizzle, and fresh whipped cream.',
    base_price: 24,
    calories: 520,
    prep_minutes: 5,
    image_url: '/images/salted-caramel-shake.jpg',
    is_featured: false,
    is_active: true,
    sizes: [
      { id: 'sz-shake-reg', name_ar: 'حجم كلاسيك (٣٥٠ مل)', name_en: 'Classic Glass (350ml)', price_delta: 0, is_default: true },
      { id: 'sz-shake-lrg', name_ar: 'حجم كبير (٥٠٠ مل)', name_en: 'Tall Glass (500ml)', price_delta: 6, is_default: false }
    ],
    allowed_addon_ids: []
  }
];

export const INITIAL_BRANCH_OVERRIDES = [
  { branch_id: 'br-riy-tahlia', product_id: 'prd-truffle-swiss', is_available: true, custom_base_price: 56 }
];

// Finding #10 Fix: Apple Pay & Online Cards are strictly disabled until a live payment gateway is integrated
export const INITIAL_PAYMENT_METHODS = [
  {
    id: 'pay_at_pickup_card',
    name_ar: 'شبكة / مدى عند الاستلام',
    name_en: 'Mada / POS Card at Pickup Counter',
    description_ar: 'الدفع عبر جهاز نقاط البيع (POS) فور وصولك للفرع',
    description_en: 'Pay via POS terminal upon arriving at the branch',
    is_enabled: true,
    requires_gateway: false,
    gateway_configured: false
  },
  {
    id: 'pay_at_pickup_cash',
    name_ar: 'نقداً عند الاستلام',
    name_en: 'Cash at Pickup Counter',
    description_ar: 'الدفع النقدي المباشر لدى كاشير الفرع عند الاستلام',
    description_en: 'Pay cash directly at the branch counter',
    is_enabled: true,
    requires_gateway: false,
    gateway_configured: false
  },
  {
    id: 'apple_pay_online',
    name_ar: 'Apple Pay (معطل — يتطلب ربط بوابة دفع إلكتروني)',
    name_en: 'Apple Pay (Disabled — Requires Payment Gateway Integration)',
    description_ar: 'معطل افتراضياً لعدم وجود ربط حي مع مزود دفع إلكتروني',
    description_en: 'Disabled because no live payment gateway is configured',
    is_enabled: false,
    requires_gateway: true,
    gateway_configured: false
  },
  {
    id: 'credit_card_online',
    name_ar: 'بطاقة ائتمانية أونلاين (معطلة — تتطلب بوابة دفع)',
    name_en: 'Online Credit Card (Disabled — Requires Payment Gateway)',
    description_ar: 'معطلة افتراضياً لعدم وجود ربط حي مع مزود دفع إلكتروني',
    description_en: 'Disabled because no live payment gateway is configured',
    is_enabled: false,
    requires_gateway: true,
    gateway_configured: false
  }
];

// ============================================================================
// 2. MULTI-BRANCH GEOLOCATION & OPERATING HOURS ENGINE
// ============================================================================

export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== 'number' || typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' || typeof lon2 !== 'number' ||
    Number.isNaN(lat1) || Number.isNaN(lon1) || Number.isNaN(lat2) || Number.isNaN(lon2)
  ) {
    throw new Error('INVALID_COORDINATES');
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

export function isBranchOpenAtTime(branch, dateObj = new Date()) {
  if (!branch || !branch.is_active || !branch.is_accepting_orders) {
    return { open: false, reason: 'BRANCH_NOT_ACCEPTING_ORDERS' };
  }
  const day = dateObj.getDay();
  if (Array.isArray(branch.closed_days) && branch.closed_days.includes(day)) {
    return { open: false, reason: 'BRANCH_CLOSED_TODAY' };
  }
  const [openH, openM] = (branch.open_time || '12:00').split(':').map(Number);
  const [closeH, closeM] = (branch.close_time || '02:00').split(':').map(Number);
  const currentMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  let isWithinHours = false;
  if (closeMinutes > openMinutes) {
    isWithinHours = currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  } else {
    isWithinHours = currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
  }

  if (!isWithinHours) {
    return { open: false, reason: 'OUTSIDE_OPERATING_HOURS' };
  }
  return { open: true, reason: 'OPEN' };
}

export function resolveBranchesForCheckout(branches, userCoords = null, checkDate = new Date()) {
  const activeBranches = branches.filter((b) => b.is_active);

  const enriched = activeBranches.map((branch) => {
    const availability = isBranchOpenAtTime(branch, checkDate);
    const distanceKm =
      userCoords && typeof userCoords.latitude === 'number' && typeof userCoords.longitude === 'number'
        ? calculateHaversineDistanceKm(
            userCoords.latitude,
            userCoords.longitude,
            branch.latitude,
            branch.longitude
          )
        : null;
    return {
      ...branch,
      distance_km: distanceKm,
      is_currently_open: availability.open,
      availability_reason: availability.reason
    };
  });

  if (userCoords && typeof userCoords.latitude === 'number' && typeof userCoords.longitude === 'number') {
    enriched.sort((a, b) => (a.distance_km ?? 999999) - (b.distance_km ?? 999999));
    const nearestOverall = enriched[0] || null;
    const nearestOpen = enriched.find((b) => b.is_currently_open) || null;
    const skippedClosedNearest =
      nearestOverall && nearestOpen && nearestOverall.id !== nearestOpen.id
        ? nearestOverall
        : null;

    return {
      geolocation_used: true,
      recommended_branch: nearestOpen,
      skipped_closed_nearest_branch: skippedClosedNearest,
      branches: enriched
    };
  }

  return {
    geolocation_used: false,
    recommended_branch: null,
    skipped_closed_nearest_branch: null,
    branches: enriched
  };
}

// ============================================================================
// 3. ZERO-TRUST SERVER-SIDE PRICING & TAX ENGINE
// ============================================================================

export function calculateVerifiedOrderPricing({
  items,
  branchId,
  products = INITIAL_PRODUCTS,
  addons = INITIAL_ADDONS,
  branchOverrides = INITIAL_BRANCH_OVERRIDES,
  vatPercentage = 15,
  clientClaimedTotal = null
}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('EMPTY_ORDER_ITEMS: Order must contain at least one item.');
  }
  if (!branchId) {
    throw new Error('MISSING_BRANCH_ID: A valid pickup branch must be selected.');
  }

  let subtotal = 0;
  const verifiedItems = [];

  for (const rawItem of items) {
    const quantity = Number(rawItem.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new Error('INVALID_ITEM_QUANTITY: Quantity must be an integer between 1 and 50.');
    }

    const product = products.find((p) => p.id === rawItem.product_id && p.is_active);
    if (!product) {
      throw new Error(`PRODUCT_NOT_FOUND_OR_INACTIVE: ${rawItem.product_id}`);
    }

    const override = branchOverrides.find(
      (o) => o.branch_id === branchId && o.product_id === product.id
    );
    if (override && override.is_available === false) {
      throw new Error(`PRODUCT_UNAVAILABLE_AT_BRANCH: ${product.name_en} is unavailable at branch ${branchId}`);
    }

    const unitBasePrice =
      override && typeof override.custom_base_price === 'number'
        ? Number(override.custom_base_price)
        : Number(product.base_price);

    let selectedSize = null;
    let sizePriceDelta = 0;
    if (Array.isArray(product.sizes) && product.sizes.length > 0) {
      selectedSize =
        product.sizes.find((s) => s.id === rawItem.size_id) ||
        product.sizes.find((s) => s.is_default) ||
        product.sizes[0];
      if (rawItem.size_id && selectedSize.id !== rawItem.size_id) {
        throw new Error(`INVALID_SIZE_OPTION: Size ${rawItem.size_id} is not valid for ${product.id}`);
      }
      sizePriceDelta = Number(selectedSize.price_delta || 0);
    }

    const unitPriceWithSize = unitBasePrice + sizePriceDelta;
    if (unitPriceWithSize <= 0) {
      throw new Error(`INVALID_COMPUTED_UNIT_PRICE: ${product.id}`);
    }

    const requestedAddonIds = Array.isArray(rawItem.addon_ids) ? rawItem.addon_ids : [];
    const addonCounts = {};
    for (const addonId of requestedAddonIds) {
      addonCounts[addonId] = (addonCounts[addonId] || 0) + 1;
    }

    let addonsUnitTotal = 0;
    const verifiedAddons = [];

    for (const [addonId, count] of Object.entries(addonCounts)) {
      if (!product.allowed_addon_ids.includes(addonId)) {
        throw new Error(`ADDON_NOT_ALLOWED_FOR_PRODUCT: Addon ${addonId} not allowed on ${product.id}`);
      }
      const addon = addons.find((a) => a.id === addonId && a.is_active);
      if (!addon) {
        throw new Error(`ADDON_NOT_FOUND_OR_INACTIVE: ${addonId}`);
      }
      if (count > addon.max_per_item) {
        throw new Error(`ADDON_MAX_LIMIT_EXCEEDED: Max ${addon.max_per_item} allowed for ${addonId}`);
      }
      const addonLinePrice = Number(addon.price) * count;
      addonsUnitTotal += addonLinePrice;
      verifiedAddons.push({
        id: addon.id,
        name_ar: addon.name_ar,
        name_en: addon.name_en,
        unit_price: Number(addon.price),
        quantity: count,
        subtotal: addonLinePrice
      });
    }

    const singleItemTotal = unitPriceWithSize + addonsUnitTotal;
    const lineTotal = Number((singleItemTotal * quantity).toFixed(2));
    subtotal = Number((subtotal + lineTotal).toFixed(2));

    verifiedItems.push({
      product_id: product.id,
      product_name_ar: product.name_ar,
      product_name_en: product.name_en,
      size_id: selectedSize ? selectedSize.id : null,
      size_name_ar: selectedSize ? selectedSize.name_ar : null,
      size_name_en: selectedSize ? selectedSize.name_en : null,
      quantity,
      unit_base_price: unitBasePrice,
      size_price_delta: sizePriceDelta,
      addons_snapshot: verifiedAddons,
      addons_unit_total: addonsUnitTotal,
      line_total: lineTotal,
      item_notes: String(rawItem.item_notes || '').slice(0, 250)
    });
  }

  const vatAmount = Number(((subtotal * Number(vatPercentage)) / 100).toFixed(2));
  const totalAmount = Number((subtotal + vatAmount).toFixed(2));

  const priceTampered =
    clientClaimedTotal !== null &&
    clientClaimedTotal !== undefined &&
    Math.abs(Number(clientClaimedTotal) - totalAmount) > 0.05;

  return {
    verified_items: verifiedItems,
    subtotal,
    vat_percentage: Number(vatPercentage),
    vat_amount: vatAmount,
    total_amount: totalAmount,
    client_price_tampered: priceTampered
  };
}

// ============================================================================
// 4. PRODUCTION CRYPTOGRAPHIC TOKENS, CAPTCHA & PHONE VALIDATION
// ============================================================================

export function validateAndNormalizeSaudiPhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { valid: false, reason: 'EMPTY_PHONE_NUMBER', normalized: null };
  }
  const digitsAndPlus = rawPhone.trim().replace(/[\s\-().]/g, '');
  let coreNineDigits = '';

  if (digitsAndPlus.startsWith('+9665') && digitsAndPlus.length === 13) {
    coreNineDigits = digitsAndPlus.slice(4);
  } else if (digitsAndPlus.startsWith('9665') && digitsAndPlus.length === 12) {
    coreNineDigits = digitsAndPlus.slice(3);
  } else if (digitsAndPlus.startsWith('05') && digitsAndPlus.length === 10) {
    coreNineDigits = digitsAndPlus.slice(1);
  } else if (digitsAndPlus.startsWith('5') && digitsAndPlus.length === 9) {
    coreNineDigits = digitsAndPlus;
  } else {
    return { valid: false, reason: 'INVALID_SAUDI_MOBILE_FORMAT', normalized: null };
  }

  if (!/^5[0-9]{8}$/.test(coreNineDigits)) {
    return { valid: false, reason: 'INVALID_SAUDI_MOBILE_DIGITS', normalized: null };
  }

  const subscriberDigits = coreNineDigits.slice(1);
  if (/^(\d){6,}$/.test(subscriberDigits) || subscriberDigits === '12345678' || subscriberDigits === '87654321') {
    return { valid: false, reason: 'SUSPICIOUS_FAKE_PHONE_PATTERN', normalized: null };
  }

  return {
    valid: true,
    reason: 'VALID',
    normalized: `+966${coreNineDigits}`
  };
}

export function generateUnguessableOrderCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(8);
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += alphabet[bytes[i] % alphabet.length];
    part2 += alphabet[bytes[i + 4] % alphabet.length];
  }
  return `BH-${part1}-${part2}`;
}

export function generateTrackingToken(orderCode, phoneNormalized, explicitSecret) {
  const secret = explicitSecret || getRequiredEnvSecret('ORDER_HMAC_SECRET');
  const randomEntropy = crypto.randomBytes(32).toString('hex'); // 256-bit cryptographic randomness
  const mac = crypto
    .createHmac('sha256', secret)
    .update(`${orderCode}:${phoneNormalized}:${randomEntropy}`)
    .digest('hex');
  return `trk_${randomEntropy}_${mac.slice(0, 32)}`;
}

export function computePayloadDigest(payload) {
  const canonical = JSON.stringify({
    branch_id: payload.branch_id,
    customer_phone: payload.customer_phone,
    payment_method_id: payload.payment_method_id,
    items: (payload.items || []).map((i) => ({
      product_id: i.product_id,
      size_id: i.size_id || null,
      quantity: Number(i.quantity),
      addon_ids: [...(i.addon_ids || [])].sort()
    }))
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Signed, Nonce-Protected Stateless CAPTCHA Challenge (Requires CAPTCHA_SIGNING_SECRET from env)
 * Combined with database `consume_captcha_nonce` RPC so a solved token can NEVER be replayed across Vercel instances!
 */
export function createAdaptiveCaptchaChallenge(explicitSecret) {
  const secret = explicitSecret || getRequiredEnvSecret('CAPTCHA_SIGNING_SECRET');
  const a = crypto.randomInt(4, 16);
  const b = crypto.randomInt(3, 13);
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(12).toString('hex');
  const expectedAnswer = String(a + b);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${nonce}:${a}:${b}:${issuedAt}:${expectedAnswer}`)
    .digest('hex');

  return {
    nonce,
    question_ar: `لحماية الطلب من البوتات، ما حاصل جمع ${a} + ${b} ؟`,
    question_en: `Anti-bot verification: What is ${a} + ${b}?`,
    token: `${nonce}.${a}.${b}.${issuedAt}.${signature}`,
    _expected_for_automated_tests: expectedAnswer
  };
}

export function verifyAdaptiveCaptchaSolution(token, userAnswer, explicitSecret, maxAgeMs = 10 * 60 * 1000) {
  const secret = explicitSecret || getRequiredEnvSecret('CAPTCHA_SIGNING_SECRET');
  if (!token || typeof token !== 'string' || userAnswer === undefined || userAnswer === null) {
    return { verified: false, reason: 'MISSING_CAPTCHA_TOKEN_OR_ANSWER', nonce: null };
  }
  const parts = token.split('.');
  if (parts.length !== 5) {
    return { verified: false, reason: 'MALFORMED_CAPTCHA_TOKEN', nonce: null };
  }
  const [nonce, aStr, bStr, issuedAtStr, providedSig] = parts;
  const issuedAt = Number(issuedAtStr);
  if (!nonce || nonce.length < 16 || Number.isNaN(issuedAt) || Date.now() - issuedAt > maxAgeMs) {
    return { verified: false, reason: 'CAPTCHA_EXPIRED', nonce: null };
  }
  const cleanAnswer = String(userAnswer).trim();
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${nonce}:${aStr}:${bStr}:${issuedAtStr}:${cleanAnswer}`)
import crypto from 'crypto';

// ============================================================================
// 0. ENVIRONMENT SECRET ENFORCEMENT (NO HARDCODED PRODUCTION DEFAULTS)
// ============================================================================
export function getRequiredEnvSecret(envVarName) {
  const val = process.env[envVarName];
  if (!val || typeof val !== 'string' || val.trim().length < 32) {
    throw new Error(
      `MISSING_OR_WEAK_ENV_SECRET: Environment variable ${envVarName} must be set and at least 32 characters long.`
    );
  }
  return val.trim();
}

export function hashClientIdentifier(rawValue, secret) {
  const key = secret || getRequiredEnvSecret('ORDER_HMAC_SECRET');
  return crypto
    .createHmac('sha256', key)
    .update(String(rawValue || 'unknown'))
    .digest('hex')
    .slice(0, 32);
}

// ============================================================================
// 1. INITIAL CATALOG & BRANCH SEED DEFINITIONS
// ============================================================================
export const INITIAL_BRANCHES = [
  {
    id: 'br-jed-sultan',
    slug: 'jeddah-prince-sultan',
    name_ar: 'فرع جدة — طريق الأمير سلطان (المحمدية)',
    name_en: 'Jeddah — Prince Sultan Rd (Al Mohammadiyyah)',
    address_ar: 'طريق الأمير سلطان، حي المحمدية، جدة 23625',
    address_en: 'Prince Sultan Road, Al Mohammadiyyah Dist, Jeddah 23625',
    latitude: 21.6679,
    longitude: 39.1215,
    phone: '+966535717670',
    map_url: 'https://www.google.com/maps/search/?api=1&query=21.6679,39.1215',
    open_time: '12:00',
    close_time: '02:00',
    closed_days: [],
    is_active: true,
    is_accepting_orders: true,
    prep_time_minutes: 15,
    pickup_instructions_ar: 'يرجى التوجه إلى كاونتر الاستلام السريع (Express Pickup) وإبراز رقم الطلب.',
    pickup_instructions_en: 'Please proceed to the Express Pickup counter and show your order code.'
  },
  {
    id: 'br-jed-hamra',
    slug: 'jeddah-al-hamra',
    name_ar: 'فرع جدة — كورنيش الحمراء',
    name_en: 'Jeddah — Al Hamra Corniche',
    address_ar: 'طريق الكورنيش، حي الحمراء، جدة 23212',
    address_en: 'Corniche Road, Al Hamra Dist, Jeddah 23212',
    latitude: 21.5242,
    longitude: 39.1531,
    phone: '+966535717671',
    map_url: 'https://www.google.com/maps/search/?api=1&query=21.5242,39.1531',
    open_time: '13:00',
    close_time: '03:00',
    closed_days: [],
    is_active: true,
    is_accepting_orders: true,
    prep_time_minutes: 18,
    pickup_instructions_ar: 'الاستلام من البوابة البحرية الجانبية المخصصة لطلبات الموقع.',
    pickup_instructions_en: 'Pickup from the Seaside Express Desk dedicated to online orders.'
  },
  {
    id: 'br-riy-tahlia',
    slug: 'riyadh-tahlia',
    name_ar: 'فرع الرياض — شارع التحلية (العليا)',
    name_en: 'Riyadh — Tahlia St (Al Olaya)',
    address_ar: 'طريق الأمير محمد بن عبدالعزيز (التحلية)، حي العليا، الرياض 12241',
    address_en: 'Prince Mohammed Bin Abdulaziz Rd (Tahlia St), Al Olaya, Riyadh 12241',
    latitude: 24.6411,
    longitude: 46.7144,
    phone: '+966535717672',
    map_url: 'https://www.google.com/maps/search/?api=1&query=24.6411,46.7144',
    open_time: '12:00',
    close_time: '01:00',
    closed_days: [],
    is_active: true,
    is_accepting_orders: true,
    prep_time_minutes: 15,
    pickup_instructions_ar: 'يرجى التوجه إلى صالة الاستلام بالطابق الأرضي.',
    pickup_instructions_en: 'Please proceed to the Ground Floor Pickup Lounge.'
  },
  {
    id: 'br-jed-obhur',
    slug: 'jeddah-north-obhur',
    name_ar: 'فرع جدة — أبحر الشمالية',
    name_en: 'Jeddah — North Obhur',
    address_ar: 'طريق عابر القارات، أبحر الشمالية، جدة 23814',
    address_en: 'North Obhur Coastal Road, Jeddah 23814',
    latitude: 21.7425,
    longitude: 39.0882,
    phone: '+966535717673',
    map_url: 'https://www.google.com/maps/search/?api=1&query=21.7425,39.0882',
    open_time: '18:00',
    close_time: '02:00',
    closed_days: [],
    is_active: true,
    is_accepting_orders: false,
    prep_time_minutes: 20,
    pickup_instructions_ar: 'مكتب الاستلام الخارجي بجوار التراس البحري.',
    pickup_instructions_en: 'Outdoor pickup desk next to the sea terrace.'
  }
];

export const INITIAL_CATEGORIES = [
  { id: 'cat-wagyu', name_ar: 'برجر الواغيو الفاخر', name_en: 'Artisan Wagyu Burgers', sort_order: 1, is_active: true },
  { id: 'cat-chicken', name_ar: 'برجر الدجاج المقرمش', name_en: 'Crispy Chicken Burgers', sort_order: 2, is_active: true },
  { id: 'cat-sides', name_ar: 'البطاطس والمقبلات', name_en: 'Artisan Sides & Fries', sort_order: 3, is_active: true },
  { id: 'cat-drinks', name_ar: 'الميلك شيك والمشروبات', name_en: 'Craft Shakes & Drinks', sort_order: 4, is_active: true }
];

export const INITIAL_ADDONS = [
  { id: 'add-cheddar', name_ar: 'شريحة شيدر إنجليزي معتق ١٨ شهراً', name_en: '18-Month Aged English Cheddar', price: 5, is_active: true, max_per_item: 3 },
  { id: 'add-bacon', name_ar: 'بيكون بقري مدخن بحطب التفاح', name_en: 'Applewood Smoked Beef Bacon', price: 8, is_active: true, max_per_item: 2 },
  { id: 'add-truffle-sauce', name_ar: 'صوص ترافل أيولي الأسود الخاص', name_en: 'House Black Truffle Aioli Dip', price: 6, is_active: true, max_per_item: 3 },
  { id: 'add-jalapeno', name_ar: 'هلابينو مشوي ومخلل', name_en: 'Charred Pickled Jalapeños', price: 4, is_active: true, max_per_item: 2 },
  { id: 'add-patty', name_ar: 'شريحة واغيو إضافية (١٥٠ جرام)', name_en: 'Extra 150g Wagyu Smash Patty', price: 16, is_active: true, max_per_item: 2 }
];

export const INITIAL_PRODUCTS = [
  {
    id: 'prd-wagyu-smash',
    category_id: 'cat-wagyu',
    name_ar: 'واغيو سماش ريزيرف المزدوج',
    name_en: 'Double Smashed Wagyu Reserve',
    description_ar: 'شريحتان من لحم الواغيو الأسترالي الفاخر (درجة الترخيم MB7+) مكرملة على الصاج الحديدي، جبن شيدر معتق، بيكون بقري مدخن، بصل مكرمل ببطء، وصوص برجر هاوس المدخن في خبز بريوش محمص بالزبدة.',
    description_en: 'Two caramelized Australian MB7+ Wagyu smash patties, aged English cheddar, crispy beef bacon, slow-braised onions, and smoky house glaze on a butter-toasted artisan brioche bun.',
    base_price: 48,
    calories: 840,
    prep_minutes: 12,
    image_url: '/images/hero-wagyu-smash.jpg',
    is_featured: true,
    is_active: true,
    sizes: [
      { id: 'sz-wagyu-single', name_ar: 'سنقل — شريحة واحدة (١٥٠غ)', name_en: 'Single — 150g Patty', price_delta: -10, is_default: false },
      { id: 'sz-wagyu-double', name_ar: 'دبل — شريحتان (٣٠٠غ)', name_en: 'Double — 300g Patties', price_delta: 0, is_default: true },
      { id: 'sz-wagyu-triple', name_ar: 'تربل — ٣ شرائح (٤٥٠غ)', name_en: 'Triple — 450g Patties', price_delta: 14, is_default: false }
    ],
    allowed_addon_ids: ['add-cheddar', 'add-bacon', 'add-truffle-sauce', 'add-jalapeno', 'add-patty']
  },
  {
    id: 'prd-truffle-swiss',
    category_id: 'cat-wagyu',
    name_ar: 'بلاك ترافل واغيو والفطر البري',
    name_en: 'Black Truffle & Wild Mushroom Wagyu',
    description_ar: 'لحم واغيو صافي مشوي على اللهب، جبن غرويير السويسري الذائب، فطر بورتوبيلو وشيتاكي محمص بالزبدة والثوم، شرائح الكمأة السوداء الإيطالية وصوص ترافل أيولي.',
    description_en: 'Flame-seared Wagyu patty, melted Swiss Gruyère, garlic-butter roasted portobello & shiitake mushrooms, shaved Italian black truffle, and house truffle aioli.',
    base_price: 54,
    calories: 790,
    prep_minutes: 14,
    image_url: '/images/truffle-mushroom-wagyu.jpg',
    is_featured: true,
    is_active: true,
    sizes: [
      { id: 'sz-truffle-single', name_ar: 'سنقل — شريحة واحدة (١٥٠غ)', name_en: 'Single — 150g Patty', price_delta: -10, is_default: false },
      { id: 'sz-truffle-double', name_ar: 'دبل — شريحتان (٣٠٠غ)', name_en: 'Double — 300g Patties', price_delta: 0, is_default: true },
      { id: 'sz-truffle-triple', name_ar: 'تربل — ٣ شرائح (٤٥٠غ)', name_en: 'Triple — 450g Patties', price_delta: 14, is_default: false }
    ],
    allowed_addon_ids: ['add-cheddar', 'add-bacon', 'add-truffle-sauce', 'add-patty']
  },
  {
    id: 'prd-smoked-brisket',
    category_id: 'cat-wagyu',
    name_ar: 'برجر البريسكت المدخن ١٢ ساعة',
    name_en: '12-Hour Smoked Brisket & Gouda Burger',
    description_ar: 'شرائح بريسكت الصدر البقري المدخن لمدة ١٢ ساعة بحطب البلوط فوق شريحة واغيو، جبن غودا المدخن، حلقات بصل مقرمشة، وصوص هيكوري باربيكيو المعتق.',
    description_en: '12-hour oak-smoked beef brisket slices stacked over a Wagyu patty, melted smoked Gouda, crispy artisan onion rings, and aged hickory BBQ glaze.',
    base_price: 58,
    calories: 920,
    prep_minutes: 15,
    image_url: '/images/smoked-brisket-burger.jpg',
    is_featured: true,
    is_active: true,
    sizes: [
      { id: 'sz-brisket-std', name_ar: 'حجم كلاسيك (٢٥٠غ لحم)', name_en: 'Classic Stack (250g Meat)', price_delta: 0, is_default: true },
      { id: 'sz-brisket-pit', name_ar: 'حجم بيت ماستر المضاعف (٤٠٠غ)', name_en: 'Pitmaster Double Stack (400g)', price_delta: 16, is_default: false }
    ],
    allowed_addon_ids: ['add-cheddar', 'add-bacon', 'add-jalapeno', 'add-patty']
  },
  {
    id: 'prd-nashville-chicken',
    category_id: 'cat-chicken',
    name_ar: 'ناشفيل الدجاج المقرمش بالعسل الحار',
    name_en: 'Crispy Nashville Hot Honey Chicken',
    description_ar: 'صدر دجاج طازج متبل ٢٤ ساعة باللبن الرائب ومقلي بقرمشة ذهبية، مغطى بزبدة العسل الحار البري، سلطة كول سلو بالتفاح الأخضر، ومخلل الشبت الفاخر.',
    description_en: '24-hour buttermilk brined crispy chicken breast glazed with wild hot honey butter, crisp green apple slaw, and house dill pickles on a toasted potato bun.',
    base_price: 39,
    calories: 710,
    prep_minutes: 12,
    image_url: '/images/nashville-hot-chicken.jpg',
    is_featured: false,
    is_active: true,
    sizes: [
      { id: 'sz-chick-1', name_ar: 'فيليه مفرد', name_en: 'Single Fillet', price_delta: 0, is_default: true },
      { id: 'sz-chick-2', name_ar: 'فيليه مزدوج', name_en: 'Double Fillet', price_delta: 12, is_default: false }
    ],
    allowed_addon_ids: ['add-cheddar', 'add-bacon', 'add-truffle-sauce', 'add-jalapeno']
  },
  {
    id: 'prd-loaded-fries',
    category_id: 'cat-sides',
    name_ar: 'بطاطس الشيدر المعتق والبيكون المدخن',
    name_en: 'Artisan Truffle & Aged Cheddar Bacon Fries',
    description_ar: 'بطاطس ريفية مقطعة يدوياً بقشرتها ومقلية مرتين للقرمشة القصوى، مغطاة بصوص جبن الشيدر الإنجليزي الدافئ، فتات البيكون البقري المدخن، والثوم المعمر الطازج.',
    description_en: 'Twice-cooked skin-on hand-cut fries smothered in warm aged English cheddar sauce, crispy smoked beef bacon bits, and fresh snipped chives.',
    base_price: 26,
    calories: 580,
    prep_minutes: 8,
    image_url: '/images/loaded-cheddar-fries.jpg',
    is_featured: false,
    is_active: true,
    sizes: [
      { id: 'sz-fries-reg', name_ar: 'حجم فردي', name_en: 'Regular Bowl', price_delta: 0, is_default: true },
      { id: 'sz-fries-share', name_ar: 'حجم عائلي للمشاركة', name_en: 'Sharing Platter', price_delta: 10, is_default: false }
    ],
    allowed_addon_ids: ['add-bacon', 'add-truffle-sauce', 'add-jalapeno']
  },
  {
    id: 'prd-salted-shake',
    category_id: 'cat-drinks',
    name_ar: 'ميلك شيك الشوكولاتة البلجيكية والكراميل المملح',
    name_en: 'Belgian Dark Chocolate & Salted Caramel Shake',
    description_ar: 'آيس كريم الفانيليا المدغشقرية المخفوق يدوياً مع الشوكولاتة البلجيكية الداكنة ٧٠٪، كراميل مملح بملح البحر الفرنسي، وكريمة مخفوقة طازجة.',
    description_en: 'Hand-spun Madagascar vanilla bean gelato blended with 70% Belgian dark chocolate, French fleur de sel caramel drizzle, and fresh whipped cream.',
    base_price: 24,
    calories: 520,
    prep_minutes: 5,
    image_url: '/images/salted-caramel-shake.jpg',
    is_featured: false,
    is_active: true,
    sizes: [
      { id: 'sz-shake-reg', name_ar: 'حجم كلاسيك (٣٥٠ مل)', name_en: 'Classic Glass (350ml)', price_delta: 0, is_default: true },
      { id: 'sz-shake-lrg', name_ar: 'حجم كبير (٥٠٠ مل)', name_en: 'Tall Glass (500ml)', price_delta: 6, is_default: false }
    ],
    allowed_addon_ids: []
  }
];

export const INITIAL_BRANCH_OVERRIDES = [
  { branch_id: 'br-riy-tahlia', product_id: 'prd-truffle-swiss', is_available: true, custom_base_price: 56 }
];

// Finding #10 Fix: Apple Pay & Online Cards are strictly disabled until a live payment gateway is integrated
export const INITIAL_PAYMENT_METHODS = [
  {
    id: 'pay_at_pickup_card',
    name_ar: 'شبكة / مدى عند الاستلام',
    name_en: 'Mada / POS Card at Pickup Counter',
    description_ar: 'الدفع عبر جهاز نقاط البيع (POS) فور وصولك للفرع',
    description_en: 'Pay via POS terminal upon arriving at the branch',
    is_enabled: true,
    requires_gateway: false,
    gateway_configured: false
  },
  {
    id: 'pay_at_pickup_cash',
    name_ar: 'نقداً عند الاستلام',
    name_en: 'Cash at Pickup Counter',
    description_ar: 'الدفع النقدي المباشر لدى كاشير الفرع عند الاستلام',
    description_en: 'Pay cash directly at the branch counter',
    is_enabled: true,
    requires_gateway: false,
    gateway_configured: false
  },
  {
    id: 'apple_pay_online',
    name_ar: 'Apple Pay (معطل — يتطلب ربط بوابة دفع إلكتروني)',
    name_en: 'Apple Pay (Disabled — Requires Payment Gateway Integration)',
    description_ar: 'معطل افتراضياً لعدم وجود ربط حي مع مزود دفع إلكتروني',
    description_en: 'Disabled because no live payment gateway is configured',
    is_enabled: false,
    requires_gateway: true,
    gateway_configured: false
  },
  {
    id: 'credit_card_online',
    name_ar: 'بطاقة ائتمانية أونلاين (معطلة — تتطلب بوابة دفع)',
    name_en: 'Online Credit Card (Disabled — Requires Payment Gateway)',
    description_ar: 'معطلة افتراضياً لعدم وجود ربط حي مع مزود دفع إلكتروني',
    description_en: 'Disabled because no live payment gateway is configured',
    is_enabled: false,
    requires_gateway: true,
    gateway_configured: false
  }
];

// ============================================================================
// 2. MULTI-BRANCH GEOLOCATION & OPERATING HOURS ENGINE
// ============================================================================
export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== 'number' || typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' || typeof lon2 !== 'number' ||
    Number.isNaN(lat1) || Number.isNaN(lon1) || Number.isNaN(lat2) || Number.isNaN(lon2)
  ) {
    throw new Error('INVALID_COORDINATES');
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

export function isBranchOpenAtTime(branch, dateObj = new Date()) {
  if (!branch || !branch.is_active || !branch.is_accepting_orders) {
    return { open: false, reason: 'BRANCH_NOT_ACCEPTING_ORDERS' };
  }
  const day = dateObj.getDay();
  if (Array.isArray(branch.closed_days) && branch.closed_days.includes(day)) {
    return { open: false, reason: 'BRANCH_CLOSED_TODAY' };
  }
  const [openH, openM] = (branch.open_time || '12:00').split(':').map(Number);
  const [closeH, closeM] = (branch.close_time || '02:00').split(':').map(Number);
  const currentMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  let isWithinHours = false;
  if (closeMinutes > openMinutes) {
    isWithinHours = currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  } else {
    isWithinHours = currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
  }
  if (!isWithinHours) {
    return { open: false, reason: 'OUTSIDE_OPERATING_HOURS' };
  }
  return { open: true, reason: 'OPEN' };
}

export function resolveBranchesForCheckout(branches, userCoords = null, checkDate = new Date()) {
  const activeBranches = branches.filter((b) => b.is_active);
  const enriched = activeBranches.map((branch) => {
    const availability = isBranchOpenAtTime(branch, checkDate);
    const distanceKm =
      userCoords && typeof userCoords.latitude === 'number' && typeof userCoords.longitude === 'number'
        ? calculateHaversineDistanceKm(
            userCoords.latitude,
            userCoords.longitude,
            branch.latitude,
            branch.longitude
          )
        : null;
    return {
      ...branch,
      distance_km: distanceKm,
      is_currently_open: availability.open,
      availability_reason: availability.reason
    };
  });

  if (userCoords && typeof userCoords.latitude === 'number' && typeof userCoords.longitude === 'number') {
    enriched.sort((a, b) => (a.distance_km ?? 999999) - (b.distance_km ?? 999999));
    const nearestOverall = enriched[0] || null;
    const nearestOpen = enriched.find((b) => b.is_currently_open) || null;
    const skippedClosedNearest =
      nearestOverall && nearestOpen && nearestOverall.id !== nearestOpen.id
        ? nearestOverall
        : null;
    return {
      geolocation_used: true,
      recommended_branch: nearestOpen,
      skipped_closed_nearest_branch: skippedClosedNearest,
      branches: enriched
    };
  }
  return {
    geolocation_used: false,
    recommended_branch: null,
    skipped_closed_nearest_branch: null,
    branches: enriched
  };
}

// ============================================================================
// 3. ZERO-TRUST SERVER-SIDE PRICING & TAX ENGINE
// ============================================================================
export function calculateVerifiedOrderPricing({
  items,
  branchId,
  products = INITIAL_PRODUCTS,
  addons = INITIAL_ADDONS,
  branchOverrides = INITIAL_BRANCH_OVERRIDES,
  vatPercentage = 15,
  clientClaimedTotal = null
}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('EMPTY_ORDER_ITEMS: Order must contain at least one item.');
  }
  if (!branchId) {
    throw new Error('MISSING_BRANCH_ID: A valid pickup branch must be selected.');
  }
  let subtotal = 0;
  const verifiedItems = [];

  for (const rawItem of items) {
    const quantity = Number(rawItem.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new Error('INVALID_ITEM_QUANTITY: Quantity must be an integer between 1 and 50.');
    }
    const product = products.find((p) => p.id === rawItem.product_id && p.is_active);
    if (!product) {
      throw new Error(`PRODUCT_NOT_FOUND_OR_INACTIVE: ${rawItem.product_id}`);
    }
    const override = branchOverrides.find(
      (o) => o.branch_id === branchId && o.product_id === product.id
    );
    if (override && override.is_available === false) {
      throw new Error(`PRODUCT_UNAVAILABLE_AT_BRANCH: ${product.name_en} is unavailable at branch ${branchId}`);
    }
    const unitBasePrice =
      override && typeof override.custom_base_price === 'number'
        ? Number(override.custom_base_price)
        : Number(product.base_price);

    let selectedSize = null;
    let sizePriceDelta = 0;
    if (Array.isArray(product.sizes) && product.sizes.length > 0) {
      selectedSize =
        product.sizes.find((s) => s.id === rawItem.size_id) ||
        product.sizes.find((s) => s.is_default) ||
        product.sizes[0];
      if (rawItem.size_id && selectedSize.id !== rawItem.size_id) {
        throw new Error(`INVALID_SIZE_OPTION: Size ${rawItem.size_id} is not valid for ${product.id}`);
      }
      sizePriceDelta = Number(selectedSize.price_delta || 0);
    }
    const unitPriceWithSize = unitBasePrice + sizePriceDelta;
    if (unitPriceWithSize <= 0) {
      throw new Error(`INVALID_COMPUTED_UNIT_PRICE: ${product.id}`);
    }

    const requestedAddonIds = Array.isArray(rawItem.addon_ids) ? rawItem.addon_ids : [];
    const addonCounts = {};
    for (const addonId of requestedAddonIds) {
      addonCounts[addonId] = (addonCounts[addonId] || 0) + 1;
    }

    let addonsUnitTotal = 0;
    const verifiedAddons = [];
    for (const [addonId, count] of Object.entries(addonCounts)) {
      if (!product.allowed_addon_ids.includes(addonId)) {
        throw new Error(`ADDON_NOT_ALLOWED_FOR_PRODUCT: Addon ${addonId} not allowed on ${product.id}`);
      }
      const addon = addons.find((a) => a.id === addonId && a.is_active);
      if (!addon) {
        throw new Error(`ADDON_NOT_FOUND_OR_INACTIVE: ${addonId}`);
      }
      if (count > addon.max_per_item) {
        throw new Error(`ADDON_MAX_LIMIT_EXCEEDED: Max ${addon.max_per_item} allowed for ${addonId}`);
      }
      const addonLinePrice = Number(addon.price) * count;
      addonsUnitTotal += addonLinePrice;
      verifiedAddons.push({
        id: addon.id,
        name_ar: addon.name_ar,
        name_en: addon.name_en,
        unit_price: Number(addon.price),
        quantity: count,
        subtotal: addonLinePrice
      });
    }

    const singleItemTotal = unitPriceWithSize + addonsUnitTotal;
    const lineTotal = Number((singleItemTotal * quantity).toFixed(2));
    subtotal = Number((subtotal + lineTotal).toFixed(2));

    verifiedItems.push({
      product_id: product.id,
      product_name_ar: product.name_ar,
      product_name_en: product.name_en,
      size_id: selectedSize ? selectedSize.id : null,
      size_name_ar: selectedSize ? selectedSize.name_ar : null,
      size_name_en: selectedSize ? selectedSize.name_en : null,
      quantity,
      unit_base_price: unitBasePrice,
      size_price_delta: sizePriceDelta,
      addons_snapshot: verifiedAddons,
      addons_unit_total: addonsUnitTotal,
      line_total: lineTotal,
      item_notes: String(rawItem.item_notes || '').slice(0, 250)
    });
  }

  const vatAmount = Number(((subtotal * Number(vatPercentage)) / 100).toFixed(2));
  const totalAmount = Number((subtotal + vatAmount).toFixed(2));
  const priceTampered =
    clientClaimedTotal !== null &&
    clientClaimedTotal !== undefined &&
    Math.abs(Number(clientClaimedTotal) - totalAmount) > 0.05;

  return {
    verified_items: verifiedItems,
    subtotal,
    vat_percentage: Number(vatPercentage),
    vat_amount: vatAmount,
    total_amount: totalAmount,
    client_price_tampered: priceTampered
  };
}

// ============================================================================
// 4. PRODUCTION CRYPTOGRAPHIC TOKENS, CAPTCHA & PHONE VALIDATION
// ============================================================================
export function validateAndNormalizeSaudiPhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { valid: false, reason: 'EMPTY_PHONE_NUMBER', normalized: null };
  }
  const digitsAndPlus = rawPhone.trim().replace(/[\s\-().]/g, '');
  let coreNineDigits = '';
  if (digitsAndPlus.startsWith('+9665') && digitsAndPlus.length === 13) {
    coreNineDigits = digitsAndPlus.slice(4);
  } else if (digitsAndPlus.startsWith('9665') && digitsAndPlus.length === 12) {
    coreNineDigits = digitsAndPlus.slice(3);
  } else if (digitsAndPlus.startsWith('05') && digitsAndPlus.length === 10) {
    coreNineDigits = digitsAndPlus.slice(1);
  } else if (digitsAndPlus.startsWith('5') && digitsAndPlus.length === 9) {
    coreNineDigits = digitsAndPlus;
  } else {
    return { valid: false, reason: 'INVALID_SAUDI_MOBILE_FORMAT', normalized: null };
  }
  if (!/^5[0-9]{8}$/.test(coreNineDigits)) {
    return { valid: false, reason: 'INVALID_SAUDI_MOBILE_DIGITS', normalized: null };
  }
  const subscriberDigits = coreNineDigits.slice(1);
  if (/^(\d)\1{6,}$/.test(subscriberDigits) || subscriberDigits === '12345678' || subscriberDigits === '87654321') {
    return { valid: false, reason: 'SUSPICIOUS_FAKE_PHONE_PATTERN', normalized: null };
  }
  return {
    valid: true,
    reason: 'VALID',
    normalized: `+966${coreNineDigits}`
  };
}

export function generateUnguessableOrderCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(8);
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += alphabet[bytes[i] % alphabet.length];
    part2 += alphabet[bytes[i + 4] % alphabet.length];
  }
  return `BH-${part1}-${part2}`;
}

export function generateTrackingToken(orderCode, phoneNormalized, explicitSecret) {
  const secret = explicitSecret || getRequiredEnvSecret('ORDER_HMAC_SECRET');
  const randomEntropy = crypto.randomBytes(32).toString('hex'); // 256-bit cryptographic randomness
  const mac = crypto
    .createHmac('sha256', secret)
    .update(`${orderCode}:${phoneNormalized}:${randomEntropy}`)
    .digest('hex');
  return `trk_${randomEntropy}_${mac.slice(0, 32)}`;
}

export function computePayloadDigest(payload) {
  const canonical = JSON.stringify({
    branch_id: payload.branch_id,
    customer_phone: payload.customer_phone,
    payment_method_id: payload.payment_method_id,
    items: (payload.items || []).map((i) => ({
      product_id: i.product_id,
      size_id: i.size_id || null,
      quantity: Number(i.quantity),
      addon_ids: [...(i.addon_ids || [])].sort()
    }))
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Signed, Nonce-Protected Stateless CAPTCHA Challenge (Requires CAPTCHA_SIGNING_SECRET from env)
 * Combined with database `consume_captcha_nonce` RPC so a solved token can NEVER be replayed across Vercel instances!
 */
export function createAdaptiveCaptchaChallenge(explicitSecret) {
  const secret = explicitSecret || getRequiredEnvSecret('CAPTCHA_SIGNING_SECRET');
  const a = crypto.randomInt(4, 16);
  const b = crypto.randomInt(3, 13);
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(12).toString('hex');
  const expectedAnswer = String(a + b);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${nonce}:${a}:${b}:${issuedAt}:${expectedAnswer}`)
    .digest('hex');

  return {
    nonce,
    question_ar: `لحماية الطلب من البوتات، ما حاصل جمع ${a} + ${b} ؟`,
    question_en: `Anti-bot verification: What is ${a} + ${b}?`,
    token: `${nonce}.${a}.${b}.${issuedAt}.${signature}`,
    _expected_for_automated_tests: expectedAnswer
  };
}

export function verifyAdaptiveCaptchaSolution(token, userAnswer, explicitSecret, maxAgeMs = 10 * 60 * 1000) {
  const secret = explicitSecret || getRequiredEnvSecret('CAPTCHA_SIGNING_SECRET');
  if (!token || typeof token !== 'string' || userAnswer === undefined || userAnswer === null) {
    return { verified: false, reason: 'MISSING_CAPTCHA_TOKEN_OR_ANSWER', nonce: null };
  }
  const parts = token.split('.');
  if (parts.length !== 5) {
    return { verified: false, reason: 'MALFORMED_CAPTCHA_TOKEN', nonce: null };
  }
  const [nonce, aStr, bStr, issuedAtStr, providedSig] = parts;
  const issuedAt = Number(issuedAtStr);
  if (!nonce || nonce.length < 16 || Number.isNaN(issuedAt) || Date.now() - issuedAt > maxAgeMs) {
    return { verified: false, reason: 'CAPTCHA_EXPIRED', nonce: null };
  }
  const cleanAnswer = String(userAnswer).trim();
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${nonce}:${aStr}:${bStr}:${issuedAtStr}:${cleanAnswer}`)
    .digest('hex');

  const sigBuf = Buffer.from(providedSig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { verified: false, reason: 'INCORRECT_CAPTCHA_ANSWER', nonce: null };
  }
  return { verified: true, reason: 'CAPTCHA_VERIFIED', nonce };
}

// ============================================================================
// 5. IMAGE UPLOAD MAGIC-BYTE FILE SIGNATURE VERIFICATION
// ============================================================================
export function verifyImageMagicBytes(buffer, declaredMimeType) {
  if (!buffer || buffer.length < 12) {
    return { valid: false, reason: 'FILE_TOO_SMALL_OR_CORRUPT' };
  }
  const bytes = new Uint8Array(buffer.subarray ? buffer.subarray(0, 12) : buffer.slice(0, 12));

  // JPEG: FF D8 FF
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  // WEBP: "RIFF" .... "WEBP"
  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (declaredMimeType === 'image/jpeg' && isJpeg) return { valid: true, format: 'jpeg' };
  if (declaredMimeType === 'image/png' && isPng) return { valid: true, format: 'png' };
  if (declaredMimeType === 'image/webp' && isWebp) return { valid: true, format: 'webp' };

  return {
    valid: false,
    reason: 'MAGIC_BYTE_MISMATCH: File binary header does not match declared image MIME type.'
  };
}

// ============================================================================
// 6. ORDER STATE MACHINE & RBAC PERMISSIONS
// ============================================================================
export const ORDER_STATUS_META = {
  new: { label_ar: 'جديد', label_en: 'New', badge_color: 'amber', step: 1 },
  pending_confirmation: { label_ar: 'بانتظار التأكيد', label_en: 'Pending Confirmation', badge_color: 'yellow', step: 2 },
  accepted: { label_ar: 'مقبول', label_en: 'Accepted', badge_color: 'blue', step: 3 },
  preparing: { label_ar: 'قيد التحضير', label_en: 'Preparing in Kitchen', badge_color: 'orange', step: 4 },
  ready_for_pickup: { label_ar: 'جاهز للاستلام', label_en: 'Ready for Pickup', badge_color: 'emerald', step: 5 },
  completed: { label_ar: 'مكتمل / تم التسليم', label_en: 'Completed / Picked Up', badge_color: 'green', step: 6 },
  rejected: { label_ar: 'مرفوض', label_en: 'Rejected', badge_color: 'red', step: -1 },
  cancelled: { label_ar: 'ملغي', label_en: 'Cancelled', badge_color: 'zinc', step: -2 }
};

export const VALID_STATUS_TRANSITIONS = {
  new: ['pending_confirmation', 'accepted', 'rejected', 'cancelled'],
  pending_confirmation: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: []
};

export const ROLE_ALLOWED_TARGET_STATUSES = {
  super_admin: ['pending_confirmation', 'accepted', 'preparing', 'ready_for_pickup', 'completed', 'rejected', 'cancelled'],
  owner: ['pending_confirmation', 'accepted', 'preparing', 'ready_for_pickup', 'completed', 'rejected', 'cancelled'],
  branch_manager: ['pending_confirmation', 'accepted', 'preparing', 'ready_for_pickup', 'completed', 'rejected', 'cancelled'],
  cashier: ['pending_confirmation', 'accepted', 'ready_for_pickup', 'completed', 'rejected', 'cancelled'],
  kitchen_staff: ['preparing', 'ready_for_pickup']
};

export const SENSITIVE_STATUSES_REQUIRING_CONFIRMATION = ['rejected', 'cancelled'];
    .digest('hex');

  const sigBuf = Buffer.from(providedSig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { verified: false, reason: 'INCORRECT_CAPTCHA_ANSWER', nonce: null };
  }
  return { verified: true, reason: 'CAPTCHA_VERIFIED', nonce };
}

// ============================================================================
// 5. IMAGE UPLOAD MAGIC-BYTE FILE SIGNATURE VERIFICATION
// ============================================================================

export function verifyImageMagicBytes(buffer, declaredMimeType) {
  if (!buffer || buffer.length < 12) {
    return { valid: false, reason: 'FILE_TOO_SMALL_OR_CORRUPT' };
  }
  const bytes = new Uint8Array(buffer.subarray ? buffer.subarray(0, 12) : buffer.slice(0, 12));

  // JPEG: FF D8 FF
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  // WEBP: "RIFF" .... "WEBP"
  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
badge_color: 'green', step: 6 },
  rejected: { label_ar: 'مرفوض', label_en: 'Rejected', badge_color: 'red', step: -1 },
  cancelled: { label_ar: 'ملغي', label_en: 'Cancelled', badge_color: 'zinc', step: -2 }
};

export const VALID_STATUS_TRANSITIONS = {
  new: ['pending_confirmation', 'accepted', 'rejected', 'cancelled'],
  pending_confirmation: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: []
};

export const ROLE_ALLOWED_TARGET_STATUSES = {
  super_admin: ['pending_confirmation', 'accepted', 'preparing', 'ready_for_pickup', 'completed', 'rejected', 'cancelled'],
  owner: ['pending_confirmation', 'accepted', 'preparing', 'ready_for_pickup', 'completed', 'rejected', 'cancelled'],
  branch_manager: ['pending_confirmation', 'accepted', 'preparing', 'ready_for_pickup', 'completed', 'rejected', 'cancelled'],
  cashier: ['pending_confirmation', 'accepted', 'ready_for_pickup', 'completed', 'rejected', 'cancelled'],
  kitchen_staff: ['preparing', 'ready_for_pickup']
};

export const SENSITIVE_STATUSES_REQUIRING_CONFIRMATION = ['rejected', 'cancelled'];
 
