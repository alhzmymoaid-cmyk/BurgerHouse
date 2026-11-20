-- Correct coupon VAT rounding to use the configured rate, then refresh the REST schema cache.
create or replace function public.create_verified_pickup_order(
  p_idempotency_key text,
  p_payload_hash text,
  p_branch_id text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_notes text,
  p_payment_method_id text,
  p_items jsonb,
  p_client_ip_hash text,
  p_session_fingerprint text,
  p_risk_score integer,
  p_tracking_token text,
  p_client_claimed_total numeric,
  p_check_timestamp timestamptz,
  p_coupon_code text
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_response jsonb;
  v_coupon public.coupons%rowtype;
  v_order_id uuid;
  v_subtotal numeric(12,2);
  v_discount numeric(12,2) := 0;
  v_new_vat numeric(12,2);
  v_new_total numeric(12,2);
  v_vat_percentage numeric(8,4);
begin
  v_response := public.create_verified_pickup_order(
    p_idempotency_key, p_payload_hash, p_branch_id, p_customer_name,
    p_customer_phone, p_customer_notes, p_payment_method_id, p_items,
    p_client_ip_hash, p_session_fingerprint, p_risk_score, p_tracking_token,
    p_client_claimed_total, p_check_timestamp
  );
  if coalesce(trim(p_coupon_code), '') = '' then return v_response; end if;
  if coalesce((v_response->>'idempotent_replay')::boolean, false) then return v_response; end if;

  select * into v_coupon from public.coupons
   where upper(code) = upper(trim(p_coupon_code)) for update;
  if not found or not v_coupon.is_active
     or v_coupon.starts_at > p_check_timestamp
     or (v_coupon.ends_at is not null and v_coupon.ends_at <= p_check_timestamp)
     or (v_coupon.branch_id is not null and v_coupon.branch_id <> p_branch_id)
     or (v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses) then
    raise exception 'COUPON_INVALID_OR_EXPIRED';
  end if;

  v_order_id := (v_response->>'id')::uuid;
  v_subtotal := (v_response->>'subtotal')::numeric;
  if v_subtotal < v_coupon.minimum_order then raise exception 'COUPON_MINIMUM_ORDER_NOT_MET'; end if;
  if v_coupon.discount_type = 'percent' then
    if v_coupon.discount_value > 100 then raise exception 'COUPON_INVALID_DISCOUNT'; end if;
    v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);
  else
    v_discount := least(v_subtotal, v_coupon.discount_value);
  end if;

  select coalesce(vat_percentage, 15) into v_vat_percentage
    from public.system_settings where id = 1;
  v_vat_percentage := coalesce(v_vat_percentage, 15);
  v_new_vat := round((v_subtotal - v_discount) * v_vat_percentage / 100, 2);
  v_new_total := round(v_subtotal - v_discount + v_new_vat, 2);

  update public.orders
     set coupon_id = v_coupon.id, coupon_code = v_coupon.code,
         discount_amount = v_discount,
         coupon_snapshot = jsonb_build_object('id',v_coupon.id,'code',v_coupon.code,'discount_type',v_coupon.discount_type,'discount_value',v_coupon.discount_value,'discount_amount',v_discount),
         vat_amount = v_new_vat, total_amount = v_new_total
   where id = v_order_id;
  update public.coupons set used_count = used_count + 1 where id = v_coupon.id;

  v_response := v_response || jsonb_build_object(
    'coupon_id',v_coupon.id,'coupon_code',v_coupon.code,
    'coupon_snapshot',jsonb_build_object('code',v_coupon.code,'discount_type',v_coupon.discount_type,'discount_value',v_coupon.discount_value),
    'discount_amount',v_discount,'vat_amount',v_new_vat,'total_amount',v_new_total
  );
  update public.idempotency_keys set response_snapshot = v_response where key = p_idempotency_key;
  return v_response;
end;
$function$;
notify pgrst, 'reload schema';