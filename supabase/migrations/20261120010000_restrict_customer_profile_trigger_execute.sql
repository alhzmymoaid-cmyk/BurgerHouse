-- The function is attached to auth.users triggers and must not be callable as a public RPC.
-- Trigger execution does not require callers to have EXECUTE privilege on the trigger function.
REVOKE ALL ON FUNCTION public.sync_customer_profile_from_auth() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_customer_profile_from_auth() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_customer_profile_from_auth() TO service_role;
