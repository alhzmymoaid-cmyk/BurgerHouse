import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Customer sessions use a separate cookie namespace from staff/owner sessions.
// This prevents a customer login from replacing or inheriting an employee session.
let customerBrowserClient: ReturnType<typeof createBrowserClient> | null = null;
export function createSupabaseCustomerBrowserClient() {
  if (!customerBrowserClient) {
    customerBrowserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: { name: 'bh-customer-auth' },
        isSingleton: false,
      }
    );
  }
  return customerBrowserClient;
}
