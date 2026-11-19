-- Keep customer phone mandatory in the email-based signup flow.
-- The phone is stored as auth user metadata, while email remains the Supabase Auth identifier.
CREATE OR REPLACE FUNCTION public.sync_customer_profile_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  customer_phone text;
BEGIN
  customer_phone := COALESCE(
    NULLIF(NEW.phone, ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  );

  IF NEW.phone IS NOT NULL OR NEW.email IS NOT NULL THEN
    INSERT INTO public.customer_profiles(id, full_name, phone)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'عميل برجر هاوس'),
      customer_phone
    )
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          phone = COALESCE(EXCLUDED.phone, public.customer_profiles.phone),
          updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$;
