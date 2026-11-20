-- Create customer profiles for email-authenticated customers as well as phone-authenticated users.
-- Preserve an existing phone number when an email-only auth update arrives.
CREATE OR REPLACE FUNCTION public.sync_customer_profile_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.phone IS NOT NULL OR NEW.email IS NOT NULL THEN
    INSERT INTO public.customer_profiles(id, full_name, phone)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'عميل برجر هاوس'),
      NEW.phone
    )
    ON CONFLICT (id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          phone = COALESCE(EXCLUDED.phone, public.customer_profiles.phone),
          updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$;
