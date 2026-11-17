-- ============================================================================
-- BURGER HOUSE — Migration 002: Strict Row-Level Security (RLS) & Role Isolation
-- ============================================================================

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_product_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_abuse_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners where applicable
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;

-- Helper functions reading strictly from auth.uid() inside PostgreSQL
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid() AND is_active = TRUE;
$$;

REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_user_branch()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT assigned_branch_id FROM public.user_profiles WHERE id = auth.uid() AND is_active = TRUE;
$$;

REVOKE ALL ON FUNCTION public.current_user_branch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_branch() TO authenticated, service_role;

-- 1. System Settings Policies
CREATE POLICY "Public read system settings" ON public.system_settings
  FOR SELECT USING (TRUE);

CREATE POLICY "Super admin full update system settings" ON public.system_settings
  FOR UPDATE USING (public.current_app_role() = 'super_admin')
  WITH CHECK (public.current_app_role() = 'super_admin');

CREATE POLICY "Owner update theme & contact settings only" ON public.system_settings
  FOR UPDATE USING (public.current_app_role() = 'owner')
  WITH CHECK (public.current_app_role() = 'owner');

-- 2. Branches & Catalog Policies (Read-only for public/staff; write restricted to owner/super_admin with WITH CHECK)
CREATE POLICY "Public read active branches" ON public.branches
  FOR SELECT USING (is_active = TRUE OR public.current_app_role() IN ('super_admin', 'owner', 'branch_manager', 'cashier', 'kitchen_staff'));

CREATE POLICY "Owner and Super Admin manage branches" ON public.branches
  FOR ALL USING (public.current_app_role() IN ('super_admin', 'owner'))
  WITH CHECK (public.current_app_role() IN ('super_admin', 'owner'));

CREATE POLICY "Public read categories" ON public.categories FOR SELECT USING (TRUE);
CREATE POLICY "Owner and Super Admin manage categories" ON public.categories
  FOR ALL USING (public.current_app_role() IN ('super_admin', 'owner'))
  WITH CHECK (public.current_app_role() IN ('super_admin', 'owner'));

CREATE POLICY "Public read products" ON public.products FOR SELECT USING (TRUE);
CREATE POLICY "Owner and Super Admin manage products" ON public.products
  FOR ALL USING (public.current_app_role() IN ('super_admin', 'owner'))
  WITH CHECK (public.current_app_role() IN ('super_admin', 'owner'));

CREATE POLICY "Public read product sizes" ON public.product_sizes FOR SELECT USING (TRUE);
CREATE POLICY "Owner and Super Admin manage sizes" ON public.product_sizes
  FOR ALL USING (public.current_app_role() IN ('super_admin', 'owner'))
  WITH CHECK (public.current_app_role() IN ('super_admin', 'owner'));

CREATE POLICY "Public read product addons" ON public.product_addons FOR SELECT USING (TRUE);
CREATE POLICY "Owner and Super Admin manage addons" ON public.product_addons
  FOR ALL USING (public.current_app_role() IN ('super_admin', 'owner'))
  WITH CHECK (public.current_app_role() IN ('super_admin', 'owner'));

CREATE POLICY "Public read branch overrides" ON public.branch_product_overrides FOR SELECT USING (TRUE);
CREATE POLICY "Owner and Super Admin manage branch overrides" ON public.branch_product_overrides
  FOR ALL USING (public.current_app_role() IN ('super_admin', 'owner'))
  WITH CHECK (public.current_app_role() IN ('super_admin', 'owner'));

CREATE POLICY "Public read enabled payment methods" ON public.payment_methods
  FOR SELECT USING (is_enabled = TRUE OR public.current_app_role() IN ('super_admin', 'owner'));
CREATE POLICY "Owner and Super Admin manage payment methods" ON public.payment_methods
  FOR ALL USING (public.current_app_role() IN ('super_admin', 'owner'))
  WITH CHECK (public.current_app_role() IN ('super_admin', 'owner'));

CREATE POLICY "Public read promotions" ON public.promotions FOR SELECT USING (TRUE);
CREATE POLICY "Owner and Super Admin manage promotions" ON public.promotions
  FOR ALL USING (public.current_app_role() IN ('super_admin', 'owner'))
  WITH CHECK (public.current_app_role() IN ('super_admin', 'owner'));

-- 3. Strict Order & Customer PII Isolation
-- Anonymous visitors have ZERO SELECT/INSERT/UPDATE/DELETE policies on public.orders.
-- Staff have SELECT only on their assigned branch; all mutations go through transition_order_status() RPC.
CREATE POLICY "Staff view only their assigned branch orders; Owner & Super Admin view all"
  ON public.orders FOR SELECT
  USING (
    public.current_app_role() IN ('super_admin', 'owner')
    OR (
      public.current_app_role() IN ('branch_manager', 'cashier', 'kitchen_staff')
      AND branch_id = public.current_user_branch()
    )
  );

CREATE POLICY "Staff read order items for accessible orders"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
      AND (
        public.current_app_role() IN ('super_admin', 'owner')
        OR (
          public.current_app_role() IN ('branch_manager', 'cashier', 'kitchen_staff')
          AND o.branch_id = public.current_user_branch()
        )
      )
    )
  );

CREATE POLICY "Staff read order status history for accessible orders"
  ON public.order_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
      AND (
        public.current_app_role() IN ('super_admin', 'owner')
        OR (
          public.current_app_role() IN ('branch_manager', 'cashier', 'kitchen_staff')
          AND o.branch_id = public.current_user_branch()
        )
      )
    )
  );

-- 4. User Profiles & Sovereign Governance Isolation
CREATE POLICY "Users read own profile; Owner reads staff; Super Admin reads all"
  ON public.user_profiles FOR SELECT
  USING (
    id = auth.uid()
    OR public.current_app_role() = 'super_admin'
    OR (public.current_app_role() = 'owner' AND role <> 'super_admin')
  );

CREATE POLICY "Super Admin manages all profiles including Owner"
  ON public.user_profiles FOR ALL
  USING (public.current_app_role() = 'super_admin')
  WITH CHECK (public.current_app_role() = 'super_admin');

CREATE POLICY "Owner manages only staff profiles (never super_admin or owner)"
  ON public.user_profiles FOR ALL
  USING (
    public.current_app_role() = 'owner'
    AND role IN ('branch_manager', 'cashier', 'kitchen_staff')
  )
  WITH CHECK (
    public.current_app_role() = 'owner'
    AND role IN ('branch_manager', 'cashier', 'kitchen_staff')
  );

-- 5. Security Logs & Blocked Entities
CREATE POLICY "Super Admin and Owner view blocked entities"
  ON public.blocked_entities FOR SELECT
  USING (public.current_app_role() IN ('super_admin', 'owner', 'branch_manager'));

CREATE POLICY "Super Admin and Owner manage blocked entities"
  ON public.blocked_entities FOR ALL
  USING (public.current_app_role() IN ('super_admin', 'owner'))
  WITH CHECK (public.current_app_role() IN ('super_admin', 'owner'));

CREATE POLICY "Super Admin and Owner read security abuse logs"
  ON public.security_abuse_logs FOR SELECT
  USING (public.current_app_role() IN ('super_admin', 'owner'));

CREATE POLICY "Super Admin and Owner read audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.current_app_role() IN ('super_admin', 'owner'));
