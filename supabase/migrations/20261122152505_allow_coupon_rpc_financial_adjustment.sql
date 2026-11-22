CREATE OR REPLACE FUNCTION public.prevent_order_financial_and_identity_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public' AS $function$
BEGIN
  IF NEW.order_code IS DISTINCT FROM OLD.order_code
     OR NEW.tracking_token IS DISTINCT FROM OLD.tracking_token
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
     OR NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id THEN
    RAISE EXCEPTION 'IMMUTABLE_ORDER_FIELD_VIOLATION: Order financial, branch, and identity fields cannot be modified after creation';
  END IF;
  IF (NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount OR NEW.total_amount IS DISTINCT FROM OLD.total_amount)
     AND COALESCE(current_setting('burger_house.in_coupon_rpc', true), '') <> 'true' THEN
    RAISE EXCEPTION 'IMMUTABLE_ORDER_FIELD_VIOLATION: Order financial, branch, and identity fields cannot be modified after creation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND COALESCE(current_setting('burger_house.in_transition_rpc', true), '') <> 'true' THEN
    RAISE EXCEPTION 'DIRECT_STATUS_UPDATE_FORBIDDEN: Must use transition_order_status() RPC';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_verified_pickup_order(
  p_idempotency_key text, p_payload_hash text, p_branch_id text, p_customer_name text,
  p_customer_phone text, p_customer_notes text, p_payment_method_id text, p_items jsonb,
  p_client_ip_hash text, p_session_fingerprint text, p_risk_score integer,
  p_tracking_token text, p_client_claimed_total numeric, p_check_timestamp timestamptz, p_coupon_code text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions' AS $function$
DECLARE
  v_response jsonb;
  v_coupon public.coupons%rowtype;
  v_order_id uuid;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2) := 0;
  v_new_vat numeric(12,2);
  v_new_total numeric(12,2);
  v_vat_percentage numeric(8,4);
BEGIN
  v_response := public.create_verified_pickup_order(
    p_idempotency_key, p_payload_hash, p_branch_id, p_customer_name,
    p_customer_phone, p_customer_notes, p_payment_method_id, p_items,
    p_client_ip_hash, p_session_fingerprint, p_risk_score, p_tracking_token,
    p_client_claimed_total, p_check_timestamp
  );
  IF COALESCE(trim(p_coupon_code), '') = '' THEN RETURN v_response; END IF;
  IF COALESCE((v_response->>'idempotent_replay')::boolean, false) THEN RETURN v_response; END IF;

  SELECT * INTO v_coupon FROM public.coupons WHERE upper(code) = upper(trim(p_coupon_code)) FOR UPDATE;
  IF NOT FOUND OR NOT v_coupon.is_active OR v_coupon.starts_at > p_check_timestamp
     OR (v_coupon.ends_at IS NOT NULL AND v_coupon.ends_at <= p_check_timestamp)
     OR (v_coupon.branch_id IS NOT NULL AND v_coupon.branch_id <> p_branch_id)
     OR (v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses) THEN
    RAISE EXCEPTION 'COUPON_INVALID_OR_EXPIRED';
  END IF;
  v_order_id := (v_response->>'id')::uuid;
  v_subtotal := (v_response->>'subtotal')::numeric;
  IF v_subtotal < v_coupon.minimum_order THEN RAISE EXCEPTION 'COUPON_MINIMUM_ORDER_NOT_MET'; END IF;
  IF v_coupon.discount_type = 'percent' THEN
    IF v_coupon.discount_value > 100 THEN RAISE EXCEPTION 'COUPON_INVALID_DISCOUNT'; END IF;
    v_discount := LEAST(round(v_subtotal * v_coupon.discount_value / 100, 2), COALESCE(v_coupon.max_discount, v_subtotal));
  ELSE
    v_discount := LEAST(v_subtotal, v_coupon.discount_value, COALESCE(v_coupon.max_discount, v_subtotal));
  END IF;
  SELECT COALESCE(vat_percentage, 15) INTO v_vat_percentage FROM public.system_settings WHERE id = 1;
  v_vat_percentage := COALESCE(v_vat_percentage, 15);
  v_new_vat := round((v_subtotal - v_discount) * v_vat_percentage / 100, 2);
  v_new_total := round(v_subtotal - v_discount + v_new_vat, 2);

  PERFORM set_config('burger_house.in_coupon_rpc', 'true', true);
  UPDATE public.orders SET coupon_id = v_coupon.id, coupon_code = v_coupon.code, discount_amount = v_discount,
    coupon_snapshot = jsonb_build_object('id',v_coupon.id,'code',v_coupon.code,'discount_type',v_coupon.discount_type,
      'discount_value',v_coupon.discount_value,'discount_amount',v_discount,'description_ar',v_coupon.description_ar,'max_discount',v_coupon.max_discount),
    vat_amount = v_new_vat, total_amount = v_new_total WHERE id = v_order_id;
  PERFORM set_config('burger_house.in_coupon_rpc', 'false', true);
  UPDATE public.coupons SET used_count = used_count + 1 WHERE id = v_coupon.id;
  v_response := v_response || jsonb_build_object('coupon_id',v_coupon.id,'coupon_code',v_coupon.code,
    'coupon_snapshot',jsonb_build_object('code',v_coupon.code,'discount_type',v_coupon.discount_type,'discount_value',v_coupon.discount_value),
    'discount_amount',v_discount,'vat_amount',v_new_vat,'total_amount',v_new_total);
  UPDATE public.idempotency_keys SET response_snapshot = v_response WHERE key = p_idempotency_key;
  RETURN v_response;
END;
$function$;
