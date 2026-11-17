-- ============================================================================
-- BURGER HOUSE — Migration 001: Core Multi-Branch & Order Management Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. User Roles & Profiles
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'super_admin',
    'owner',
    'branch_manager',
    'cashier',
    'kitchen_staff'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'new',
    'pending_confirmation',
    'accepted',
    'preparing',
    'ready_for_pickup',
    'completed',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.system_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  site_online BOOLEAN NOT NULL DEFAULT TRUE,
  maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  maintenance_message_ar TEXT NOT NULL DEFAULT 'نحن نقوم بتحديث أفراننا ومعداتنا لتقديم تجربة أفضل. نعود إليكم قريباً.',
  maintenance_message_en TEXT NOT NULL DEFAULT 'We are upgrading our kitchen systems for a finer experience. Back shortly.',
  brand_name_ar TEXT NOT NULL DEFAULT 'برجر هاوس',
  brand_name_en TEXT NOT NULL DEFAULT 'BURGER HOUSE',
  support_phone TEXT NOT NULL DEFAULT '+966535717670',
  support_whatsapp TEXT NOT NULL DEFAULT '+966535717670',
  vat_percentage NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  published_theme JSONB NOT NULL DEFAULT '{"primary":"#D49A3A","secondary":"#B84A27","bg":"#0B0A09","surface":"#141210","heroBadgeAr":"واغيو فاخر محضر على اللهب","heroBadgeEn":"FIRE-CRAFTED ARTISAN WAGYU"}'::jsonb,
  draft_theme JSONB NOT NULL DEFAULT '{"primary":"#D49A3A","secondary":"#B84A27","bg":"#0B0A09","surface":"#141210","heroBadgeAr":"واغيو فاخر محضر على اللهب","heroBadgeEn":"FIRE-CRAFTED ARTISAN WAGYU"}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.branches (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  address_ar TEXT NOT NULL,
  address_en TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  phone TEXT NOT NULL,
  map_url TEXT NOT NULL,
  open_time TEXT NOT NULL DEFAULT '12:00',
  close_time TEXT NOT NULL DEFAULT '02:00',
  closed_days INT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_accepting_orders BOOLEAN NOT NULL DEFAULT TRUE,
  prep_time_minutes INT NOT NULL DEFAULT 15 CHECK (prep_time_minutes BETWEEN 5 AND 120),
  pickup_instructions_ar TEXT NOT NULL DEFAULT 'يرجى التوجه إلى كاونتر الاستلام السريع وإبراز رقم الطلب.',
  pickup_instructions_en TEXT NOT NULL DEFAULT 'Please proceed to the Express Pickup counter and show your order code.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL,
  assigned_branch_id TEXT REFERENCES public.branches(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  description_en TEXT NOT NULL,
  base_price NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
  calories INT NOT NULL DEFAULT 650,
  prep_minutes INT NOT NULL DEFAULT 12,
  image_url TEXT NOT NULL,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.product_sizes (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  price_delta NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.product_addons (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  max_per_item INT NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS public.branch_product_overrides (
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  custom_base_price NUMERIC(10,2) CHECK (custom_base_price IS NULL OR custom_base_price >= 0),
  PRIMARY KEY (branch_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  description_en TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.promotions (
  id TEXT PRIMARY KEY,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  subtitle_ar TEXT NOT NULL,
  subtitle_en TEXT NOT NULL,
  badge_ar TEXT NOT NULL,
  badge_en TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Orders Table (Immutable branch_id once created)
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT UNIQUE NOT NULL,
  tracking_token TEXT NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  branch_id TEXT NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  branch_snapshot JSONB NOT NULL,
  customer_name TEXT NOT NULL CHECK (char_length(trim(customer_name)) >= 2),
  customer_phone TEXT NOT NULL CHECK (customer_phone ~ '^\+9665[0-9]{8}$'),
  customer_notes TEXT DEFAULT '',
  fulfillment_type TEXT NOT NULL DEFAULT 'pickup' CHECK (fulfillment_type = 'pickup'),
  payment_method_id TEXT NOT NULL REFERENCES public.payment_methods(id),
  subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal > 0),
  vat_amount NUMERIC(10,2) NOT NULL CHECK (vat_amount >= 0),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount > 0),
  estimated_pickup_at TIMESTAMPTZ NOT NULL,
  status order_status NOT NULL DEFAULT 'new',
  client_ip_hash TEXT NOT NULL,
  session_fingerprint TEXT NOT NULL,
  risk_score INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rejected_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id),
  product_name_ar TEXT NOT NULL,
  product_name_en TEXT NOT NULL,
  size_id TEXT,
  size_name_ar TEXT,
  size_name_en TEXT,
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  unit_base_price NUMERIC(10,2) NOT NULL,
  size_price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
  addons_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  addons_unit_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(10,2) NOT NULL CHECK (line_total >= 0),
  item_notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status order_status,
  to_status order_status NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Security, Rate-Limiting & Anti-Abuse Tables
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  order_code TEXT NOT NULL,
  response_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('ip', 'session', 'phone')),
  identifier_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.blocked_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('phone', 'ip', 'session')),
  entity_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  blocked_by TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_value)
);

CREATE TABLE IF NOT EXISTS public.security_abuse_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  client_ip_hash TEXT,
  session_fingerprint TEXT,
  customer_phone TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent changing branch_id after an order is created
CREATE OR REPLACE FUNCTION public.prevent_order_branch_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    RAISE EXCEPTION 'IMMUTABLE_BRANCH_VIOLATION: Cannot change branch_id after order creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_order_branch ON public.orders;
CREATE TRIGGER trg_immutable_order_branch
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_branch_mutation();
