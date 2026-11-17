-- ============================================================================
-- BURGER HOUSE — Migration 004: Atomic Order RPCs, Shared Serverless Rate-Limiting,
-- Single-Use CAPTCHA Nonces, Role-Verified Status Transitions & Privacy-Safe Tracking
-- ============================================================================

-- 1. Enforce Gateway Configuration Constraint on Payment Methods
ALTER TABLE public.payment_methods DROP CONSTRAINT IF EXISTS chk_gateway_must_be_configured_to_enable;
ALTER TABLE public.payment_methods ADD CONSTRAINT chk_gateway_must_be_configured_to_enable
  CHECK (NOT (requires_gateway AND is_enabled AND NOT gateway_configured));

-- 2. Single-Use CAPTCHA Nonce Store (Prevents CAPTCHA token replay across Vercel instances)
CREATE TABLE IF NOT EXISTS public.used_captcha_nonces (
  nonce TEXT PRIMARY KEY,
  client_ip_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.used_captcha_nonces ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_captcha_nonce(
  p_nonce TEXT,
  p_client_ip_hash TEXT,
  p_ttl_seconds INT DEFAULT 600
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Purge expired nonces opportunistically
  DELETE FROM public.used_captcha_nonces WHERE expires_at < NOW();

  INSERT INTO public.used_captcha_nonces (nonce, client_ip_hash, expires_at)
  VALUES (p_nonce, p_client_ip_hash, NOW() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (nonce) DO NOTHING;

  RETURN FOUND;
END;
$$;

-- 3. Atomic Order Creation RPC (create_verified_pickup_order)
-- Executes inside a single PostgreSQL transaction with advisory locks to guarantee:
-- - Zero duplicate orders under concurrent multi-instance Vercel execution
-- - Shared database-backed rate-limiting & blocklist enforcement
-- - Authoritative server-side price, branch override, size delta, add-on, and 15% VAT calculation
-- - Strict rejection of closed branches, disabled payment methods, or client price tampering
CREATE OR REPLACE FUNCTION public.create_verified_pickup_order(
  p_idempotency_key TEXT,
  p_payload_hash TEXT,
  p_branch_id TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_notes TEXT,
  p_payment_method_id TEXT,
  p_items JSONB,
  p_client_ip_hash TEXT,
  p_session_fingerprint TEXT,
  p_risk_score INT DEFAULT 0,
  p_tracking_token TEXT DEFAULT NULL,
  p_client_claimed_total NUMERIC DEFAULT NULL,
  p_check_timestamp TIMESTAMPTZ DEFAULT NOW()
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings RECORD;
  v_existing_idem RECORD;
  v_blocked RECORD;
  v_branch RECORD;
  v_payment RECORD;
  v_ip_count INT;
  v_session_count INT;
  v_phone_count INT;
  v_burst_count INT;
  v_riyadh_now TIMESTAMP;
  v_current_minutes INT;
  v_open_minutes INT;
  v_close_minutes INT;
  v_is_within_hours BOOLEAN;
  v_item JSONB;
  v_product RECORD;
  v_override RECORD;
  v_size RECORD;
  v_addon RECORD;
  v_addon_id TEXT;
  v_addon_counts JSONB;
  v_addon_key TEXT;
  v_addon_qty INT;
  v_unit_base NUMERIC(10,2);
  v_size_delta NUMERIC(10,2);
  v_addons_unit_total NUMERIC(10,2);
  v_line_total NUMERIC(10,2);
  v_subtotal NUMERIC(10,2) := 0.00;
  v_vat_amount NUMERIC(10,2) := 0.00;
  v_total_amount NUMERIC(10,2) := 0.00;
  v_verified_items JSONB := '[]'::jsonb;
  v_verified_addons JSONB;
  v_order_id UUID;
  v_order_code TEXT;
  v_tracking_token TEXT;
  v_estimated_pickup TIMESTAMPTZ;
  v_response JSONB;
  v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes BYTEA;
BEGIN
  -- A. Serialize concurrent calls sharing the same Idempotency-Key across all server instances
  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'MISSING_IDEMPOTENCY_KEY';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bh_idem_' || p_idempotency_key));

  -- Check if this Idempotency-Key was already processed
  SELECT * INTO v_existing_idem FROM public.idempotency_keys WHERE key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing_idem.payload_hash IS DISTINCT FROM p_payload_hash THEN
      INSERT INTO public.security_abuse_logs (event_type, severity, client_ip_hash, session_fingerprint, customer_phone, details)
      VALUES ('IDEMPOTENCY_KEY_REUSE_MISMATCH', 'high', p_client_ip_hash, p_session_fingerprint, p_customer_phone,
              jsonb_build_object('idempotency_key', p_idempotency_key));
      RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH';
    END IF;
    RETURN v_existing_idem.response_snapshot || jsonb_build_object('idempotent_replay', TRUE);
  END IF;

  -- B. Verify System Online & Not in Maintenance Mode
  SELECT * INTO v_settings FROM public.system_settings WHERE id = 1;
  IF FOUND AND (NOT v_settings.site_online OR v_settings.maintenance_mode) THEN
    RAISE EXCEPTION 'SYSTEM_MAINTENANCE_OR_OFFLINE';
  END IF;

  -- C. Validate Customer Name & Normalized Saudi Mobile Format
  IF p_customer_name IS NULL OR char_length(trim(p_customer_name)) < 2 OR char_length(trim(p_customer_name)) > 80 THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_NAME';
  END IF;
  IF p_customer_phone IS NULL OR p_customer_phone !~ '^\+9665[0-9]{8}$' THEN
    RAISE EXCEPTION 'INVALID_SAUDI_MOBILE_FORMAT';
  END IF;
  IF substring(p_customer_phone FROM 6) ~ '^([0-9])\1{6,}$'
     OR substring(p_customer_phone FROM 6) IN ('12345678', '87654321') THEN
    INSERT INTO public.security_abuse_logs (event_type, severity, client_ip_hash, session_fingerprint, customer_phone, details)
    VALUES ('SUSPICIOUS_FAKE_PHONE_PATTERN', 'medium', p_client_ip_hash, p_session_fingerprint, p_customer_phone, '{}'::jsonb);
    RAISE EXCEPTION 'SUSPICIOUS_FAKE_PHONE_PATTERN';
  END IF;

  -- D. Check Shared Blocklist (Phone, IP, Session)
  SELECT * INTO v_blocked
  FROM public.blocked_entities
  WHERE is_active = TRUE
    AND (expires_at IS NULL OR expires_at > p_check_timestamp)
    AND (
      (entity_type = 'phone' AND entity_value = p_customer_phone)
      OR (entity_type = 'ip' AND entity_value = p_client_ip_hash)
      OR (entity_type = 'session' AND entity_value = p_session_fingerprint)
    )
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.security_abuse_logs (event_type, severity, client_ip_hash, session_fingerprint, customer_phone, details)
    VALUES ('BLOCKED_ENTITY_ATTEMPT', 'high', p_client_ip_hash, p_session_fingerprint, p_customer_phone,
            jsonb_build_object('blocked_type', v_blocked.entity_type, 'reason', v_blocked.reason));
    RAISE EXCEPTION 'ENTITY_BLOCKED:%', v_blocked.reason;
  END IF;

  -- E. Shared Multi-Instance Rate Limiting (15-min sliding window + 10-sec burst guard)
  PERFORM pg_advisory_xact_lock(hashtext('bh_rl_' || COALESCE(p_client_ip_hash, '') || '_' || COALESCE(p_customer_phone, '')));
  DELETE FROM public.rate_limit_buckets WHERE created_at < (p_check_timestamp - INTERVAL '15 minutes');

  SELECT COUNT(*) INTO v_ip_count FROM public.rate_limit_buckets
   WHERE identifier_type = 'ip' AND identifier_value = p_client_ip_hash AND created_at >= (p_check_timestamp - INTERVAL '15 minutes');
  SELECT COUNT(*) INTO v_session_count FROM public.rate_limit_buckets
   WHERE identifier_type = 'session' AND identifier_value = p_session_fingerprint AND created_at >= (p_check_timestamp - INTERVAL '15 minutes');
  SELECT COUNT(*) INTO v_phone_count FROM public.rate_limit_buckets
   WHERE identifier_type = 'phone' AND identifier_value = p_customer_phone AND created_at >= (p_check_timestamp - INTERVAL '15 minutes');
  SELECT COUNT(*) INTO v_burst_count FROM public.rate_limit_buckets
   WHERE identifier_type IN ('ip', 'session')
     AND identifier_value IN (p_client_ip_hash, p_session_fingerprint)
     AND created_at >= (p_check_timestamp - INTERVAL '10 seconds');

  IF v_ip_count >= 3 OR v_session_count >= 3 OR v_phone_count >= 3 OR v_burst_count >= 1 THEN
    INSERT INTO public.security_abuse_logs (event_type, severity, client_ip_hash, session_fingerprint, customer_phone, details)
    VALUES ('RATE_LIMIT_EXCEEDED', 'medium', p_client_ip_hash, p_session_fingerprint, p_customer_phone,
            jsonb_build_object('ip_count', v_ip_count, 'session_count', v_session_count, 'phone_count', v_phone_count, 'burst_count', v_burst_count));
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED';
  END IF;

  -- F. Verify Target Branch Exists, Is Active, Accepts Orders, and Is Within Operating Hours
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id;
  IF NOT FOUND OR NOT v_branch.is_active THEN
    RAISE EXCEPTION 'INVALID_BRANCH';
  END IF;
  IF NOT v_branch.is_accepting_orders THEN
    RAISE EXCEPTION 'BRANCH_NOT_ACCEPTING_ORDERS';
  END IF;

  v_riyadh_now := p_check_timestamp AT TIME ZONE 'Asia/Riyadh';
  IF EXTRACT(DOW FROM v_riyadh_now)::INT = ANY(v_branch.closed_days) THEN
    RAISE EXCEPTION 'BRANCH_CLOSED_TODAY';
  END IF;

  v_current_minutes := EXTRACT(HOUR FROM v_riyadh_now)::INT * 60 + EXTRACT(MINUTE FROM v_riyadh_now)::INT;
  v_open_minutes := split_part(v_branch.open_time, ':', 1)::INT * 60 + split_part(v_branch.open_time, ':', 2)::INT;
  v_close_minutes := split_part(v_branch.close_time, ':', 1)::INT * 60 + split_part(v_branch.close_time, ':', 2)::INT;

  IF v_close_minutes > v_open_minutes THEN
    v_is_within_hours := (v_current_minutes >= v_open_minutes AND v_current_minutes <= v_close_minutes);
  ELSE
    v_is_within_hours := (v_current_minutes >= v_open_minutes OR v_current_minutes <= v_close_minutes);
  END IF;

  IF NOT v_is_within_hours THEN
    RAISE EXCEPTION 'OUTSIDE_OPERATING_HOURS';
  END IF;

  -- G. Verify Payment Method Is Enabled & Not an Unconfigured Gateway
  SELECT * INTO v_payment FROM public.payment_methods WHERE id = p_payment_method_id;
  IF NOT FOUND OR NOT v_payment.is_enabled OR (v_payment.requires_gateway AND NOT v_payment.gateway_configured) THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_DISABLED_OR_INVALID';
  END IF;

  -- H. Validate Items & Compute Authoritative Server-Side Pricing
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_ORDER_ITEMS';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'quantity') IS NULL OR (v_item->>'quantity')::INT < 1 OR (v_item->>'quantity')::INT > 50 THEN
      RAISE EXCEPTION 'INVALID_ITEM_QUANTITY';
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id') AND is_active = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_INACTIVE:%', (v_item->>'product_id');
    END IF;

    SELECT * INTO v_override FROM public.branch_product_overrides
     WHERE branch_id = v_branch.id AND product_id = v_product.id;
    IF FOUND AND NOT v_override.is_available THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE_AT_BRANCH:%', v_product.id;
    END IF;

    v_unit_base := COALESCE(v_override.custom_base_price, v_product.base_price);

    -- Size lookup
    v_size_delta := 0.00;
    IF (v_item->>'size_id') IS NOT NULL AND (v_item->>'size_id') <> '' THEN
      SELECT * INTO v_size FROM public.product_sizes
       WHERE id = (v_item->>'size_id') AND product_id = v_product.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_SIZE_OPTION:%', (v_item->>'size_id');
      END IF;
      v_size_delta := v_size.price_delta;
    ELSE
      SELECT * INTO v_size FROM public.product_sizes
       WHERE product_id = v_product.id ORDER BY is_default DESC, sort_order ASC LIMIT 1;
      IF FOUND THEN
        v_size_delta := v_size.price_delta;
      END IF;
    END IF;

    -- Add-ons lookup & validation
    v_addons_unit_total := 0.00;
    v_verified_addons := '[]'::jsonb;
    v_addon_counts := '{}'::jsonb;

    IF v_item ? 'addon_ids' AND jsonb_typeof(v_item->'addon_ids') = 'array' THEN
      FOR v_addon_id IN SELECT jsonb_array_elements_text(v_item->'addon_ids') LOOP
        v_addon_counts := jsonb_set(
          v_addon_counts,
          ARRAY[v_addon_id],
          to_jsonb(COALESCE((v_addon_counts->>v_addon_id)::INT, 0) + 1)
        );
      END LOOP;

      FOR v_addon_key, v_addon_qty IN SELECT key, value::text::int FROM jsonb_each(v_addon_counts) LOOP
        IF NOT (v_addon_key = ANY(v_product.allowed_addon_ids)) THEN
          RAISE EXCEPTION 'ADDON_NOT_ALLOWED_FOR_PRODUCT:%', v_addon_key;
        END IF;
        SELECT * INTO v_addon FROM public.product_addons WHERE id = v_addon_key AND is_active = TRUE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'ADDON_NOT_FOUND_OR_INACTIVE:%', v_addon_key;
        END IF;
        IF v_addon_qty > v_addon.max_per_item THEN
          RAISE EXCEPTION 'ADDON_MAX_LIMIT_EXCEEDED:%', v_addon_key;
        END IF;
        v_addons_unit_total := v_addons_unit_total + (v_addon.price * v_addon_qty);
        v_verified_addons := v_verified_addons || jsonb_build_object(
          'id', v_addon.id,
          'name_ar', v_addon.name_ar,
          'name_en', v_addon.name_en,
          'unit_price', v_addon.price,
          'quantity', v_addon_qty,
          'subtotal', ROUND(v_addon.price * v_addon_qty, 2)
        );
      END LOOP;
    END IF;

    v_line_total := ROUND((v_unit_base + v_size_delta + v_addons_unit_total) * ((v_item->>'quantity')::INT), 2);
    v_subtotal := v_subtotal + v_line_total;

    v_verified_items := v_verified_items || jsonb_build_object(
      'product_id', v_product.id,
      'product_name_ar', v_product.name_ar,
      'product_name_en', v_product.name_en,
      'size_id', v_size.id,
      'size_name_ar', v_size.name_ar,
      'size_name_en', v_size.name_en,
      'quantity', (v_item->>'quantity')::INT,
      'unit_base_price', v_unit_base,
      'size_price_delta', v_size_delta,
      'addons_snapshot', v_verified_addons,
      'addons_unit_total', v_addons_unit_total,
      'line_total', v_line_total,
      'item_notes', left(COALESCE(v_item->>'item_notes', ''), 250)
    );
  END LOOP;

  v_vat_amount := ROUND(v_subtotal * (COALESCE(v_settings.vat_percentage, 15.00) / 100.0), 2);
  v_total_amount := ROUND(v_subtotal + v_vat_amount, 2);

  IF p_client_claimed_total IS NOT NULL AND ABS(p_client_claimed_total - v_total_amount) > 0.05 THEN
    INSERT INTO public.security_abuse_logs (event_type, severity, client_ip_hash, session_fingerprint, customer_phone, details)
    VALUES ('CLIENT_PRICE_TAMPERING_DETECTED', 'critical', p_client_ip_hash, p_session_fingerprint, p_customer_phone,
            jsonb_build_object('claimed_total', p_client_claimed_total, 'server_total', v_total_amount));
    RAISE EXCEPTION 'PRICE_TAMPERING_REJECTED';
  END IF;

  -- I. Generate Unguessable Order Code & Persist Order + Items + History + Rate Limit + Idempotency
  LOOP
    v_bytes := gen_random_bytes(8);
    v_order_code := 'BH-'
      || substr(v_alphabet, (get_byte(v_bytes, 0) % 32) + 1, 1)
      || substr(v_alphabet, (get_byte(v_bytes, 1) % 32) + 1, 1)
      || substr(v_alphabet, (get_byte(v_bytes, 2) % 32) + 1, 1)
      || substr(v_alphabet, (get_byte(v_bytes, 3) % 32) + 1, 1)
      || '-'
      || substr(v_alphabet, (get_byte(v_bytes, 4) % 32) + 1, 1)
      || substr(v_alphabet, (get_byte(v_bytes, 5) % 32) + 1, 1)
      || substr(v_alphabet, (get_byte(v_bytes, 6) % 32) + 1, 1)
      || substr(v_alphabet, (get_byte(v_bytes, 7) % 32) + 1, 1);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_code = v_order_code);
  END LOOP;

  v_tracking_token := COALESCE(p_tracking_token, encode(gen_random_bytes(16), 'hex'));
  v_estimated_pickup := p_check_timestamp + make_interval(mins => v_branch.prep_time_minutes);

  INSERT INTO public.orders (
    order_code, tracking_token, idempotency_key, branch_id, branch_snapshot,
    customer_name, customer_phone, customer_notes, fulfillment_type, payment_method_id,
    subtotal, vat_amount, total_amount, estimated_pickup_at, status,
    client_ip_hash, session_fingerprint, risk_score, created_at
  ) VALUES (
    v_order_code, v_tracking_token, p_idempotency_key, v_branch.id,
    jsonb_build_object(
      'id', v_branch.id,
      'name_ar', v_branch.name_ar,
      'name_en', v_branch.name_en,
      'address_ar', v_branch.address_ar,
      'address_en', v_branch.address_en,
      'phone', v_branch.phone,
      'map_url', v_branch.map_url,
      'latitude', v_branch.latitude,
      'longitude', v_branch.longitude
    ),
    trim(p_customer_name), p_customer_phone, left(COALESCE(p_customer_notes, ''), 300),
    'pickup', v_payment.id, v_subtotal, v_vat_amount, v_total_amount,
    v_estimated_pickup, 'new', p_client_ip_hash, p_session_fingerprint, p_risk_score, p_check_timestamp
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_verified_items) LOOP
    INSERT INTO public.order_items (
      order_id, product_id, product_name_ar, product_name_en,
      size_id, size_name_ar, size_name_en, quantity,
      unit_base_price, size_price_delta, addons_snapshot, addons_unit_total, line_total, item_notes
    ) VALUES (
      v_order_id, v_item->>'product_id', v_item->>'product_name_ar', v_item->>'product_name_en',
      v_item->>'size_id', v_item->>'size_name_ar', v_item->>'size_name_en', (v_item->>'quantity')::INT,
      (v_item->>'unit_base_price')::NUMERIC, (v_item->>'size_price_delta')::NUMERIC,
      v_item->'addons_snapshot', (v_item->>'addons_unit_total')::NUMERIC,
      (v_item->>'line_total')::NUMERIC, v_item->>'item_notes'
    );
  END LOOP;

  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, actor_id, actor_name, actor_role, note, created_at
  ) VALUES (
    v_order_id, NULL, 'new', NULL, 'بوابة الطلبات الذكية (PostgreSQL RPC)', 'system',
    'تم التحقق من الأسعار والفرع وإنشاء الطلب ذرياً داخل قاعدة البيانات', p_check_timestamp
  );

  INSERT INTO public.rate_limit_buckets (identifier_type, identifier_value, created_at)
  VALUES
    ('ip', p_client_ip_hash, p_check_timestamp),
    ('session', p_session_fingerprint, p_check_timestamp),
    ('phone', p_customer_phone, p_check_timestamp);

  v_response := jsonb_build_object(
    'id', v_order_id,
    'order_code', v_order_code,
    'tracking_token', v_tracking_token,
    'branch_id', v_branch.id,
    'branch_snapshot', jsonb_build_object(
      'id', v_branch.id,
      'name_ar', v_branch.name_ar,
      'name_en', v_branch.name_en,
      'address_ar', v_branch.address_ar,
      'address_en', v_branch.address_en,
      'phone', v_branch.phone,
      'map_url', v_branch.map_url,
      'latitude', v_branch.latitude,
      'longitude', v_branch.longitude
    ),
    'customer_name', trim(p_customer_name),
    'customer_phone', p_customer_phone,
    'customer_notes', left(COALESCE(p_customer_notes, ''), 300),
    'fulfillment_type', 'pickup',
    'payment_method_id', v_payment.id,
    'payment_method_name_ar', v_payment.name_ar,
    'payment_method_name_en', v_payment.name_en,
    'items', v_verified_items,
    'subtotal', v_subtotal,
    'vat_amount', v_vat_amount,
    'total_amount', v_total_amount,
    'status', 'new',
    'created_at', p_check_timestamp,
    'estimated_pickup_at', v_estimated_pickup,
    'idempotent_replay', FALSE
  );

  INSERT INTO public.idempotency_keys (key, payload_hash, order_code, response_snapshot, created_at)
  VALUES (p_idempotency_key, p_payload_hash, v_order_code, v_response, p_check_timestamp);

  RETURN v_response;
END;
$$;

-- 4. Server-Authenticated Order Status Transition RPC (transition_order_status)
-- Never trusts browser-supplied actor role or order object; queries user_profiles & locks orders row.
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
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED_ACTOR';
  END IF;

  SELECT * INTO v_actor FROM public.user_profiles WHERE id = v_caller_uid AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTOR_PROFILE_NOT_FOUND_OR_INACTIVE';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE order_code = upper(trim(p_order_code)) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Enforce strict branch isolation for branch-level staff
  IF v_actor.role IN ('branch_manager', 'cashier', 'kitchen_staff')
     AND v_actor.assigned_branch_id IS DISTINCT FROM v_order.branch_id THEN
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

-- 5. Privacy-Safe Customer Order Tracking RPC (get_order_tracking_status)
-- Requires BOTH order_code AND secret tracking_token. Never leaks raw customer phone or full name.
CREATE OR REPLACE FUNCTION public.get_order_tracking_status(
  p_order_code TEXT,
  p_tracking_token TEXT
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_items JSONB;
  v_history JSONB;
  v_masked_name TEXT;
  v_masked_phone TEXT;
BEGIN
  IF p_order_code IS NULL OR p_tracking_token IS NULL OR char_length(trim(p_tracking_token)) < 8 THEN
    RAISE EXCEPTION 'INVALID_TRACKING_CREDENTIALS';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE order_code = upper(trim(p_order_code))
    AND tracking_token = trim(p_tracking_token);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_TRACKING_NOT_FOUND_OR_UNAUTHORIZED';
  END IF;

  v_masked_name := left(v_order.customer_name, 1) || '***';
  v_masked_phone := left(v_order.customer_phone, 5) || '****' || right(v_order.customer_phone, 3);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_name_ar', product_name_ar,
    'product_name_en', product_name_en,
    'size_name_ar', size_name_ar,
    'size_name_en', size_name_en,
    'quantity', quantity,
    'addons_snapshot', addons_snapshot,
    'line_total', line_total
  )), '[]'::jsonb)
  INTO v_items
  FROM public.order_items
  WHERE order_id = v_order.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'from_status', from_status,
    'to_status', to_status,
    'note', note,
    'timestamp', created_at
  ) ORDER BY created_at ASC), '[]'::jsonb)
  INTO v_history
  FROM public.order_status_history
  WHERE order_id = v_order.id;

  RETURN jsonb_build_object(
    'order_code', v_order.order_code,
    'branch_id', v_order.branch_id,
    'branch_snapshot', v_order.branch_snapshot,
    'customer_name_masked', v_masked_name,
    'customer_phone_masked', v_masked_phone,
    'fulfillment_type', v_order.fulfillment_type,
    'payment_method_id', v_order.payment_method_id,
    'subtotal', v_order.subtotal,
    'vat_amount', v_order.vat_amount,
    'total_amount', v_order.total_amount,
    'status', v_order.status,
    'created_at', v_order.created_at,
    'accepted_at', v_order.accepted_at,
    'ready_at', v_order.ready_at,
    'completed_at', v_order.completed_at,
    'estimated_pickup_at', v_order.estimated_pickup_at,
    'items', v_items,
    'status_history', v_history
  );
END;
$$;


-- Lock down EXECUTE permissions on all SECURITY DEFINER RPCs
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
