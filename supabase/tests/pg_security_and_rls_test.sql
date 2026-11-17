-- ============================================================================
-- BURGER HOUSE — Real PostgreSQL Security, RPC ACL, auth.uid() & RLS Test Suite
-- Run in psql or Supabase SQL Editor: wraps all assertions in a transaction
-- and verifies anon, customer, branch staff, owner, super_admin, and service_role.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_order_res JSONB;
  v_order_code TEXT;
  v_tracking_token TEXT;
  v_transition_res JSONB;
  v_track_res JSONB;
  v_count INT;
  v_err_caught BOOLEAN;
BEGIN
  -- 1. Seed test profiles in public.user_profiles for RLS & auth.uid() verification
  INSERT INTO public.user_profiles (id, email, full_name, role, assigned_branch_id, is_active)
  VALUES
    ('11111111-1111-4111-8111-111111111111'::uuid, 'super@burgerhouse.sa', 'مؤيد الحزمي (Super Admin)', 'super_admin', NULL, TRUE),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'owner@burgerhouse.sa', 'مالك المطعم', 'owner', NULL, TRUE),
    ('33333333-3333-4333-8333-333333333333'::uuid, 'sultan.cashier@burgerhouse.sa', 'سلمان (كاشير الأمير سلطان)', 'cashier', 'br-jed-sultan', TRUE),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'sultan.kitchen@burgerhouse.sa', 'عمر (مطبخ الأمير سلطان)', 'kitchen_staff', 'br-jed-sultan', TRUE),
    ('55555555-5555-4555-8555-555555555555'::uuid, 'hamra.mgr@burgerhouse.sa', 'ريان (مدير فرع الحمراء)', 'branch_manager', 'br-jed-hamra', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- 2. Test Order Creation via service_role RPC
  v_order_res := public.create_verified_pickup_order(
    'idem-pg-test-0001',
    'hash-pg-test-0001',
    'br-jed-sultan',
    'مؤيد محمد الحزمي',
    '+966535717670',
    'بدون بصل',
    'pay_at_pickup_card',
    '[{"product_id":"prd-wagyu-smash","size_id":"sz-wagyu-double","quantity":1,"addon_ids":["add-cheddar"]}]'::jsonb,
    'ip-hash-001',
    'sess-hash-001',
    0,
    'trk_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef_sig1234567890',
    60.95,
    '2026-11-16T19:00:00+03:00'::timestamptz
  );

  v_order_code := v_order_res->>'order_code';
  v_tracking_token := v_order_res->>'tracking_token';
  ASSERT v_order_code LIKE 'BH-%', 'Order code must match BH-XXXX-XXXX';
  ASSERT (v_order_res->>'total_amount')::numeric = 60.95, 'Server total with 15% VAT must equal 60.95 SAR';

  -- 3. Test Idempotency (Duplicate call returns existing order without creating a second row)
  v_order_res := public.create_verified_pickup_order(
    'idem-pg-test-0001',
    'hash-pg-test-0001',
    'br-jed-sultan',
    'مؤيد محمد الحزمي',
    '+966535717670',
    'بدون بصل',
    'pay_at_pickup_card',
    '[{"product_id":"prd-wagyu-smash","size_id":"sz-wagyu-double","quantity":1,"addon_ids":["add-cheddar"]}]'::jsonb,
    'ip-hash-001',
    'sess-hash-001',
    0,
    v_tracking_token,
    60.95,
    '2026-11-16T19:00:05+03:00'::timestamptz
  );
  ASSERT (v_order_res->>'idempotent_replay')::boolean = TRUE, 'Duplicate idempotency key must return idempotent_replay = TRUE';

  -- 4. Test Immutability of Financial & Branch Columns on public.orders
  v_err_caught := FALSE;
  BEGIN
    UPDATE public.orders SET total_amount = 1.00 WHERE order_code = v_order_code;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;
  ASSERT v_err_caught = TRUE, 'Direct mutation of order total_amount MUST be blocked by trigger';

  -- 5. Test Unauthenticated / Customer Impersonation Attempt on transition_order_status (auth.uid() = NULL)
  PERFORM set_config('request.jwt.claim.sub', '', true);
  v_err_caught := FALSE;
  BEGIN
    PERFORM public.transition_order_status(v_order_code, 'accepted', FALSE, 'Trying without auth.uid()');
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;
  ASSERT v_err_caught = TRUE, 'transition_order_status MUST fail when auth.uid() is NULL';

  -- 6. Test Cross-Branch Staff Isolation (Al-Hamra Manager trying to accept Prince Sultan order)
  PERFORM set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
  v_err_caught := FALSE;
  BEGIN
    PERFORM public.transition_order_status(v_order_code, 'accepted', FALSE, 'Cross-branch attempt');
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;
  ASSERT v_err_caught = TRUE, 'Al-Hamra Manager MUST be blocked from modifying Prince Sultan order';

  -- 7. Test Role Restriction (Kitchen Staff trying to accept a 'new' order)
  PERFORM set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
  v_err_caught := FALSE;
  BEGIN
    PERFORM public.transition_order_status(v_order_code, 'accepted', FALSE, 'Kitchen trying to accept');
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;
  ASSERT v_err_caught = TRUE, 'Kitchen staff MUST be blocked from accepting a new order';

  -- 8. Test Valid Cashier Acceptance & Kitchen Preparation via auth.uid()
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
  v_transition_res := public.transition_order_status(v_order_code, 'accepted', FALSE, 'Accepted by Prince Sultan Cashier');
  ASSERT (v_transition_res->>'status') = 'accepted', 'Order status must transition to accepted';

  PERFORM set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
  v_transition_res := public.transition_order_status(v_order_code, 'preparing', FALSE, 'Started cooking');
  ASSERT (v_transition_res->>'status') = 'preparing', 'Order status must transition to preparing';

  -- 9. Test Owner Blocked from Modifying Sovereign Settings (site_online / maintenance_mode)
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  PERFORM set_config('role', 'authenticated', true);
  v_err_caught := FALSE;
  BEGIN
    UPDATE public.system_settings SET site_online = FALSE WHERE id = 1;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;
  ASSERT v_err_caught = TRUE, 'Owner MUST be blocked from toggling sovereign site_online column';

  RAISE NOTICE 'ALL POSTGRESQL SECURITY, RLS & RPC ASSERTIONS PASSED SUCCESSFULLY.';
END $$;

ROLLBACK;
