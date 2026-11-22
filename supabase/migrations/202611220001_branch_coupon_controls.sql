ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS max_discount numeric(12,2),
  ADD COLUMN IF NOT EXISTS description_ar text NOT NULL DEFAULT '';

ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_max_discount_check;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_max_discount_check CHECK (max_discount IS NULL OR max_discount > 0);

CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_case_insensitive_uidx
  ON public.coupons (lower(code));

-- Cap the authoritative database-side coupon calculation, not only the browser preview.
DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_verified_pickup_order' AND p.pronargs = 15;

  IF v_definition IS NULL THEN RAISE EXCEPTION 'Coupon-aware order RPC overload not found'; END IF;

  IF position('v_coupon.max_discount' in v_definition) = 0 THEN
    v_definition := replace(v_definition,
      'v_discount := round(v_subtotal * v_coupon.discount_value / 100, 2);',
      'v_discount := LEAST(round(v_subtotal * v_coupon.discount_value / 100, 2), COALESCE(v_coupon.max_discount, v_subtotal));');
    v_definition := replace(v_definition,
      'v_discount := least(v_subtotal, v_coupon.discount_value);',
      'v_discount := LEAST(v_subtotal, v_coupon.discount_value, COALESCE(v_coupon.max_discount, v_subtotal));');
    v_definition := replace(v_definition,
      '''discount_amount'',v_discount)',
      '''discount_amount'',v_discount,''description_ar'',v_coupon.description_ar,''max_discount'',v_coupon.max_discount)');
    EXECUTE v_definition;
  END IF;
END $$;
