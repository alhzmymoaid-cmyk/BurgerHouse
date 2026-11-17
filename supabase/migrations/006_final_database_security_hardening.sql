-- ============================================================================
-- BURGER HOUSE — Migration 006: Final Database Security & RPC Privilege Hardening
-- 1. Eliminates p_actor_uid from transition_order_status (derives identity strictly from auth.uid())
-- 2. Applies REVOKE EXECUTE FROM PUBLIC and explicit least-privilege GRANT EXECUTE on all RPCs
-- 3. Enforces column-level immutability on orders (prices/totals/branch) and sovereign settings
-- ============================================================================

-- 1. Drop old 5-argument transition_order_status signature that accepted p_actor_uid
DROP FUNCTION IF EXISTS public.transition_order_status(TEXT, order_status, UUID, BOOLEAN, TEXT);

-- 2. Recreate transition_order_status with 4 arguments — derives caller identity strictly from auth.uid()!
CREATE OR REPLACE FUNCTION public.transition_order_status(
  p_order_code TEXT,
  p_target_status order_status,
  p_confirmed BOOLEAN DEFAULT FALSE,
  p_reason_note TEXT DEFAULT ''
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_uid UUID;
  v_actor RECORD;
  v_order RECORD;
  v_prev_status order_status;
  v_history JSONB;
BEGIN
  -- Strictly extract caller identity from PostgreSQL session JWT (auth.uid())
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED_ACTOR: Must be called by an authenticated session (auth.uid() is NULL)';
  END IF;

  SELECT * INTO v_actor
  FROM public.user_profiles
  WHERE id = v_caller_uid AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTOR_PROFILE_NOT_FOUND_OR_INACTIVE';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE order_code = upper(trim(p_order_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Enforce strict branch isolation for branch-level staff
  IF v_actor.role IN ('branch_manager', 'cashier', 'kitchen_staff')
     AND v_actor.assigned_branch_id IS DISTINCT FROM v_order.branch_id THEN
    INSERT INTO public.security_abuse_logs (event_type, severity, details)
    VALUES ('CROSS_BRANCH_RPC_ATTEMPT', 'high', jsonb_build_object(
      'actor_id', v_actor.id,
      'actor_branch', v_actor.assigned_branch_id,
      'order_branch', v_order.branch_id,
      'order_code', v_order.order_code
    ));
    RAISE EXCEPTION 'CROSS_BRANCH_ACCESS_DENIED';
  END IF;

  -- Enforce role-specific allowed target statuses
  IF v_actor.role = 'kitchen_staff' AND p_target_status NOT IN ('preparing', 'ready_for_pickup') THEN
    RAISE EXCEPTION 'ROLE_NOT_AUTHORIZED_FOR_STATUS';
  END IF;
  IF v_actor.role = 'cashier' AND p_target_status = 'preparing' THEN
    RAISE EXCEPTION 'ROLE_NOT_AUTHORIZED_FOR_STATUS';
  END IF;

  -- Enforce State Machine
  IF NOT public.is_valid_order_transition(v_order.status, p_target_status) THEN
    RAISE EXCEPTION 'ILLOGICAL_STATUS_TRANSITION:%->%', v_order.status, p_target_status;
  END IF;

  -- Enforce Confirmation for Sensitive Statuses
  IF p_target_status IN ('rejected', 'cancelled') AND NOT COALESCE(p_confirmed, FALSE) THEN
    RAISE EXCEPTION 'CONFIRMATION_REQUIRED_FOR_SENSITIVE_ACTION';
  END IF;

  v_prev_status := v_order.status;

  -- Set local context flag so the order immutability trigger knows this update comes from the verified RPC
  PERFORM set_config('burger_house.in_transition_rpc', 'true', true);

  UPDATE public.orders
  SET
    status = p_target_status,
    accepted_at = CASE WHEN p_target_status = 'accepted' AND accepted_at IS NULL THEN NOW() ELSE accepted_at END,
    ready_at = CASE WHEN p_target_status = 'ready_for_pickup' AND ready_at IS NULL THEN NOW() ELSE ready_at END,
    completed_at = CASE WHEN p_target_status = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
    rejected_reason = CASE WHEN p_target_status IN ('rejected', 'cancelled') THEN left(COALESCE(p_reason_note, ''), 300) ELSE rejected_reason END
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, actor_id, actor_name, actor_role, note, created_at
  ) VALUES (
    v_order.id, v_prev_status, p_target_status, v_actor.id, v_actor.full_name, v_actor.role::TEXT,
    left(COALESCE(p_reason_note, ''), 300), NOW()
  );

  INSERT INTO public.audit_logs (
    actor_id, actor_name, actor_role, action, target_type, target_id, metadata
  ) VALUES (
    v_actor.id, v_actor.full_name, v_actor.role::TEXT, 'ORDER_STATUS_TRANSITION', 'order', v_order.order_code,
    jsonb_build_object('from', v_prev_status, 'to', p_target_status, 'branch_id', v_order.branch_id, 'note', p_reason_note)
  );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from_status', from_status,
    'to_status', to_status,
    'actor_name', actor_name,
    'actor_role', actor_role,
    'note', note,
    'timestamp', created_at
  ) ORDER BY created_at ASC), '[]'::jsonb)
  INTO v_history
  FROM public.order_status_history
  WHERE order_id = v_order.id;

  RETURN jsonb_build_object(
    'id', v_order.id,
    'order_code', v_order.order_code,
    'branch_id', v_order.branch_id,
    'status', v_order.status,
    'accepted_at', v_order.accepted_at,
    'ready_at', v_order.ready_at,
    'completed_at', v_order.completed_at,
    'rejected_reason', v_order.rejected_reason,
    'status_history', v_history
  );
END;
$$;

-- 3. Trigger Preventing Any Client/Staff Modification of Order Financial or Identity Columns
CREATE OR REPLACE FUNCTION public.prevent_order_financial_and_identity_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_code IS DISTINCT FROM OLD.order_code
     OR NEW.tracking_token IS DISTINCT FROM OLD.tracking_token
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
     OR NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id THEN
    RAISE EXCEPTION 'IMMUTABLE_ORDER_FIELD_VIOLATION: Order financial, branch, and identity fields cannot be modified after creation';
  END IF;

  -- Ensure status changes only occur via transition_order_status RPC
  IF NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(current_setting('burger_house.in_transition_rpc', true), '') <> 'true' THEN
    RAISE EXCEPTION 'DIRECT_STATUS_UPDATE_FORBIDDEN: Must use transition_order_status() RPC';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_order_financial_mutation ON public.orders;
CREATE TRIGGER trg_prevent_order_financial_mutation
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_financial_and_identity_mutation();

-- 4. Trigger Preventing Owner from Modifying Sovereign Kill-Switch or VAT Columns on system_settings
CREATE OR REPLACE FUNCTION public.enforce_system_settings_sovereign_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.site_online IS DISTINCT FROM OLD.site_online
      OR NEW.maintenance_mode IS DISTINCT FROM OLD.maintenance_mode
      OR NEW.vat_percentage IS DISTINCT FROM OLD.vat_percentage) THEN
    IF current_setting('role', true) <> 'service_role'
       AND public.current_app_role() IS DISTINCT FROM 'super_admin' THEN
      RAISE EXCEPTION 'SOVEREIGN_PRIVILEGE_REQUIRED: Only super_admin can modify site_online, maintenance_mode, or vat_percentage';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sovereign_settings ON public.system_settings;
CREATE TRIGGER trg_enforce_sovereign_settings
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_system_settings_sovereign_columns();

-- 5. Strict REVOKE EXECUTE FROM PUBLIC & Role-Scoped GRANT EXECUTE on ALL Functions
REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_user_branch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_branch() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_valid_order_transition(order_status, order_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_order_transition(order_status, order_status) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.consume_captcha_nonce(TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_captcha_nonce(TEXT, TEXT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.create_verified_pickup_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, INT, TEXT, NUMERIC, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_verified_pickup_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, INT, TEXT, NUMERIC, TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION public.transition_order_status(TEXT, order_status, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(TEXT, order_status, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_order_tracking_status(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_tracking_status(TEXT, TEXT) TO service_role;

-- Drop any legacy direct UPDATE policy on orders for staff (all status transitions go via RPC)
DROP POLICY IF EXISTS "Staff update only their assigned branch orders" ON public.orders;
