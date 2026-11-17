-- ============================================================================
-- BURGER HOUSE — Migration 003: State Machine Trigger & Full Catalog Seed
-- ============================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS allowed_addon_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS requires_gateway BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS gateway_configured BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.is_valid_order_transition(
  p_from order_status,
  p_to order_status
) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_from = p_to THEN RETURN FALSE; END IF;
  CASE p_from
    WHEN 'new' THEN
      RETURN p_to IN ('pending_confirmation', 'accepted', 'rejected', 'cancelled');
    WHEN 'pending_confirmation' THEN
      RETURN p_to IN ('accepted', 'rejected', 'cancelled');
    WHEN 'accepted' THEN
      RETURN p_to IN ('preparing', 'cancelled');
    WHEN 'preparing' THEN
      RETURN p_to IN ('ready_for_pickup', 'cancelled');
    WHEN 'ready_for_pickup' THEN
      RETURN p_to IN ('completed', 'cancelled');
    WHEN 'completed', 'rejected', 'cancelled' THEN
      RETURN FALSE;
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_order_status_state_machine()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.is_valid_order_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Cannot transition order from % to %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'accepted' AND OLD.accepted_at IS NULL THEN
      NEW.accepted_at := NOW();
    ELSIF NEW.status = 'ready_for_pickup' AND OLD.ready_at IS NULL THEN
      NEW.ready_at := NOW();
    ELSIF NEW.status = 'completed' AND OLD.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_state_machine ON public.orders;
CREATE TRIGGER trg_enforce_order_state_machine
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_status_state_machine();

-- Seed System Settings
INSERT INTO public.system_settings (id, site_online, maintenance_mode)
VALUES (1, TRUE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- Seed Verified Branches
INSERT INTO public.branches (id, slug, name_ar, name_en, address_ar, address_en, latitude, longitude, phone, map_url, open_time, close_time, is_active, is_accepting_orders, prep_time_minutes)
VALUES
  ('br-jed-sultan', 'jeddah-prince-sultan', 'فرع جدة — طريق الأمير سلطان (المحمدية)', 'Jeddah — Prince Sultan Rd (Al Mohammadiyyah)', 'طريق الأمير سلطان، حي المحمدية، جدة 23625', 'Prince Sultan Road, Al Mohammadiyyah Dist, Jeddah 23625', 21.6679, 39.1215, '+966535717670', 'https://www.google.com/maps/search/?api=1&query=21.6679,39.1215', '12:00', '02:00', TRUE, TRUE, 15),
  ('br-jed-hamra', 'jeddah-al-hamra', 'فرع جدة — كورنيش الحمراء', 'Jeddah — Al Hamra Corniche', 'طريق الكورنيش، حي الحمراء، جدة 23212', 'Corniche Road, Al Hamra Dist, Jeddah 23212', 21.5242, 39.1531, '+966535717671', 'https://www.google.com/maps/search/?api=1&query=21.5242,39.1531', '13:00', '03:00', TRUE, TRUE, 18),
  ('br-riy-tahlia', 'riyadh-tahlia', 'فرع الرياض — شارع التحلية (العليا)', 'Riyadh — Tahlia St (Al Olaya)', 'طريق الأمير محمد بن عبدالعزيز (التحلية)، حي العليا، الرياض 12241', 'Prince Mohammed Bin Abdulaziz Rd (Tahlia St), Al Olaya, Riyadh 12241', 24.6411, 46.7144, '+966535717672', 'https://www.google.com/maps/search/?api=1&query=24.6411,46.7144', '12:00', '01:00', TRUE, TRUE, 15),
  ('br-jed-obhur', 'jeddah-north-obhur', 'فرع جدة — أبحر الشمالية', 'Jeddah — North Obhur', 'طريق عابر القارات، أبحر الشمالية، جدة 23814', 'North Obhur Coastal Rd, Jeddah 23814', 21.7425, 39.0882, '+966535717673', 'https://www.google.com/maps/search/?api=1&query=21.7425,39.0882', '18:00', '02:00', TRUE, FALSE, 20)
ON CONFLICT (id) DO NOTHING;

-- Seed Categories
INSERT INTO public.categories (id, name_ar, name_en, sort_order, is_active)
VALUES
  ('cat-wagyu', 'برجر الواغيو الفاخر', 'Artisan Wagyu Burgers', 1, TRUE),
  ('cat-chicken', 'برجر الدجاج المقرمش', 'Crispy Chicken Burgers', 2, TRUE),
  ('cat-sides', 'البطاطس والمقبلات', 'Artisan Sides & Fries', 3, TRUE),
  ('cat-drinks', 'الميلك شيك والمشروبات', 'Craft Shakes & Drinks', 4, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed Add-ons
INSERT INTO public.product_addons (id, name_ar, name_en, price, is_active, max_per_item)
VALUES
  ('add-cheddar', 'شريحة شيدر إنجليزي معتق ١٨ شهراً', '18-Month Aged English Cheddar', 5.00, TRUE, 3),
  ('add-bacon', 'بيكون بقري مدخن بحطب التفاح', 'Applewood Smoked Beef Bacon', 8.00, TRUE, 2),
  ('add-truffle-sauce', 'صوص ترافل أيولي الأسود الخاص', 'House Black Truffle Aioli Dip', 6.00, TRUE, 3),
  ('add-jalapeno', 'هلابينو مشوي ومخلل', 'Charred Pickled Jalapeños', 4.00, TRUE, 2),
  ('add-patty', 'شريحة واغيو إضافية (١٥٠ جرام)', 'Extra 150g Wagyu Smash Patty', 16.00, TRUE, 2)
ON CONFLICT (id) DO NOTHING;

-- Seed Products
INSERT INTO public.products (id, category_id, name_ar, name_en, description_ar, description_en, base_price, calories, prep_minutes, image_url, is_featured, is_active, sort_order, allowed_addon_ids)
VALUES
  ('prd-wagyu-smash', 'cat-wagyu', 'واغيو سماش ريزيرف المزدوج', 'Double Smashed Wagyu Reserve', 'شريحتان من لحم الواغيو الأسترالي الفاخر MB7+ مكرملة على الصاج الحديدي، جبن شيدر معتق، بيكون بقري مدخن، وبصل مكرمل.', 'Two caramelized Australian MB7+ Wagyu smash patties, aged English cheddar, crispy beef bacon, and slow-braised onions.', 48.00, 840, 12, '/images/hero-wagyu-smash.jpg', TRUE, TRUE, 1, ARRAY['add-cheddar','add-bacon','add-truffle-sauce','add-jalapeno','add-patty']),
  ('prd-truffle-swiss', 'cat-wagyu', 'بلاك ترافل واغيو والفطر البري', 'Black Truffle & Wild Mushroom Wagyu', 'لحم واغيو صافي مشوي على اللهب، جبن غرويير السويسري الذائب، فطر بورتوبيلو محمص بالزبدة، وصوص ترافل أيولي.', 'Flame-seared Wagyu patty, melted Swiss Gruyère, garlic-butter roasted portobello mushrooms, and black truffle aioli.', 54.00, 790, 14, '/images/truffle-mushroom-wagyu.jpg', TRUE, TRUE, 2, ARRAY['add-cheddar','add-bacon','add-truffle-sauce','add-patty']),
  ('prd-smoked-brisket', 'cat-wagyu', 'برجر البريسكت المدخن ١٢ ساعة', '12-Hour Smoked Brisket & Gouda Burger', 'شرائح بريسكت الصدر البقري المدخن ١٢ ساعة بحطب البلوط فوق شريحة واغيو، جبن غودا المدخن، وحلقات بصل مقرمشة.', '12-hour oak-smoked beef brisket slices stacked over a Wagyu patty, melted smoked Gouda, and crispy onion rings.', 58.00, 920, 15, '/images/smoked-brisket-burger.jpg', TRUE, TRUE, 3, ARRAY['add-cheddar','add-bacon','add-jalapeno','add-patty']),
  ('prd-nashville-chicken', 'cat-chicken', 'ناشفيل الدجاج المقرمش بالعسل الحار', 'Crispy Nashville Hot Honey Chicken', 'صدر دجاج طازج متبل ٢٤ ساعة باللبن الرائب ومقلي بقرمشة ذهبية، مغطى بزبدة العسل الحار البري وسلطة كول سلو.', '24-hour buttermilk brined crispy chicken breast glazed with wild hot honey butter and crisp green apple slaw.', 39.00, 710, 12, '/images/nashville-hot-chicken.jpg', FALSE, TRUE, 4, ARRAY['add-cheddar','add-bacon','add-truffle-sauce','add-jalapeno']),
  ('prd-loaded-fries', 'cat-sides', 'بطاطس الشيدر المعتق والبيكون المدخن', 'Artisan Truffle & Aged Cheddar Bacon Fries', 'بطاطس ريفية مقطعة يدوياً بقشرتها ومقلية مرتين، مغطاة بصوص جبن الشيدر الإنجليزي الدافئ وفتات البيكون المدخن.', 'Twice-cooked skin-on hand-cut fries smothered in warm aged English cheddar sauce and crispy smoked beef bacon bits.', 26.00, 580, 8, '/images/loaded-cheddar-fries.jpg', FALSE, TRUE, 5, ARRAY['add-bacon','add-truffle-sauce','add-jalapeno']),
  ('prd-salted-shake', 'cat-drinks', 'ميلك شيك الشوكولاتة البلجيكية والكراميل المملح', 'Belgian Dark Chocolate & Salted Caramel Shake', 'آيس كريم الفانيليا المدغشقرية المخفوق يدوياً مع الشوكولاتة البلجيكية الداكنة ٧٠٪ وكراميل مملح بملح البحر الفرنسي.', 'Hand-spun Madagascar vanilla bean gelato blended with 70% Belgian dark chocolate and French salted caramel.', 24.00, 520, 5, '/images/salted-caramel-shake.jpg', FALSE, TRUE, 6, ARRAY[]::TEXT[])
ON CONFLICT (id) DO NOTHING;

-- Seed Product Sizes
INSERT INTO public.product_sizes (id, product_id, name_ar, name_en, price_delta, is_default, sort_order)
VALUES
  ('sz-wagyu-single', 'prd-wagyu-smash', 'سنقل — شريحة واحدة (١٥٠غ)', 'Single — 150g Patty', -10.00, FALSE, 1),
  ('sz-wagyu-double', 'prd-wagyu-smash', 'دبل — شريحتان (٣٠٠غ)', 'Double — 300g Patties', 0.00, TRUE, 2),
  ('sz-wagyu-triple', 'prd-wagyu-smash', 'تربل — ٣ شرائح (٤٥٠غ)', 'Triple — 450g Patties', 14.00, FALSE, 3),
  ('sz-truffle-single', 'prd-truffle-swiss', 'سنقل — شريحة واحدة (١٥٠غ)', 'Single — 150g Patty', -10.00, FALSE, 1),
  ('sz-truffle-double', 'prd-truffle-swiss', 'دبل — شريحتان (٣٠٠غ)', 'Double — 300g Patties', 0.00, TRUE, 2),
  ('sz-truffle-triple', 'prd-truffle-swiss', 'تربل — ٣ شرائح (٤٥٠غ)', 'Triple — 450g Patties', 14.00, FALSE, 3),
  ('sz-brisket-std', 'prd-smoked-brisket', 'حجم كلاسيك (٢٥٠غ لحم)', 'Classic Stack (250g Meat)', 0.00, TRUE, 1),
  ('sz-brisket-pit', 'prd-smoked-brisket', 'حجم بيت ماستر المضاعف (٤٠٠غ)', 'Pitmaster Double Stack (400g)', 16.00, FALSE, 2),
  ('sz-chick-1', 'prd-nashville-chicken', 'فيليه مفرد', 'Single Fillet', 0.00, TRUE, 1),
  ('sz-chick-2', 'prd-nashville-chicken', 'فيليه مزدوج', 'Double Fillet', 12.00, FALSE, 2),
  ('sz-fries-reg', 'prd-loaded-fries', 'حجم فردي', 'Regular Bowl', 0.00, TRUE, 1),
  ('sz-fries-share', 'prd-loaded-fries', 'حجم عائلي للمشاركة', 'Sharing Platter', 10.00, FALSE, 2),
  ('sz-shake-reg', 'prd-salted-shake', 'حجم كلاسيك (٣٥٠ مل)', 'Classic Glass (350ml)', 0.00, TRUE, 1),
  ('sz-shake-lrg', 'prd-salted-shake', 'حجم كبير (٥٠٠ مل)', 'Tall Glass (500ml)', 6.00, FALSE, 2)
ON CONFLICT (id) DO NOTHING;

-- Seed Branch Price Override (Riyadh Tahlia custom price for Black Truffle Wagyu)
INSERT INTO public.branch_product_overrides (branch_id, product_id, is_available, custom_base_price)
VALUES ('br-riy-tahlia', 'prd-truffle-swiss', TRUE, 56.00)
ON CONFLICT (branch_id, product_id) DO NOTHING;

-- Seed Payment Methods (Online gateways without active provider integration are strictly DISABLED)
INSERT INTO public.payment_methods (id, name_ar, name_en, description_ar, description_en, is_enabled, requires_gateway, gateway_configured, sort_order)
VALUES
  ('pay_at_pickup_card', 'شبكة / مدى عند الاستلام', 'Mada / POS Card at Pickup Counter', 'الدفع عبر جهاز نقاط البيع (POS) فور وصولك للفرع', 'Pay via POS terminal upon arriving at the branch', TRUE, FALSE, FALSE, 1),
  ('pay_at_pickup_cash', 'نقداً عند الاستلام', 'Cash at Pickup Counter', 'الدفع النقدي المباشر لدى كاشير الفرع عند الاستلام', 'Pay cash directly at the branch counter', TRUE, FALSE, FALSE, 2),
  ('apple_pay_online', 'Apple Pay (يتطلب ربط بوابة دفع إلكتروني)', 'Apple Pay (Requires Payment Gateway Setup)', 'معطل افتراضياً لعدم ربط بوابة دفع حقيقية بعد', 'Disabled until a live payment gateway is configured', FALSE, TRUE, FALSE, 3),
  ('credit_card_online', 'بطاقة ائتمانية أونلاين (يتطلب ربط بوابة دفع)', 'Online Credit Card (Requires Payment Gateway Setup)', 'معطل افتراضياً لعدم ربط بوابة دفع حقيقية بعد', 'Disabled until a live payment gateway is configured', FALSE, TRUE, FALSE, 4)
ON CONFLICT (id) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  requires_gateway = EXCLUDED.requires_gateway,
  gateway_configured = EXCLUDED.gateway_configured;
