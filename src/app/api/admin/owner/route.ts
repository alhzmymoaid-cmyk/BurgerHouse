import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleOwnerAdminRequest } from '@/lib/supabase/api-handlers.mjs';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

export async function GET() {
  try {
    const authSupabase = createSupabaseServerClient();
    const authCheck = await requireAuthenticatedProfile(authSupabase, ['super_admin', 'owner']);
    if (!authCheck.ok) {
      return NextResponse.json({ error: authCheck.code }, { status: authCheck.status });
    }

    const serviceSupabase = createSupabaseServiceRoleClient();
    const [branchesRes, productsRes, overridesRes, paymentsRes, promosRes, staffRes, ordersRes, logsRes, settingsRes] =
      await Promise.all([
        serviceSupabase.from('branches').select('*').order('created_at', { ascending: true }),
        serviceSupabase.from('products').select('*, product_sizes(*)').order('sort_order', { ascending: true }),
        serviceSupabase.from('branch_product_overrides').select('*'),
        serviceSupabase.from('payment_methods').select('*').order('sort_order', { ascending: true }),
        serviceSupabase.from('promotions').select('*').order('created_at', { ascending: false }),
        serviceSupabase.from('user_profiles').select('*').neq('role', 'super_admin'),
        serviceSupabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200),
        serviceSupabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
        serviceSupabase.from('system_settings').select('*').eq('id', 1).single()
      ]);

    return NextResponse.json({
      profile: authCheck.profile,
      settings: settingsRes.data,
      branches: branchesRes.data || [],
      products: productsRes.data || [],
      branch_overrides: overridesRes.data || [],
      payment_methods: paymentsRes.data || [],
      promotions: promosRes.data || [],
      staff: staffRes.data || [],
      orders: ordersRes.data || [],
      audit_logs: logsRes.data || []
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authSupabase = createSupabaseServerClient();
    const serviceSupabase = createSupabaseServiceRoleClient();
    const body = await request.json().catch(() => ({}));

    const result = await handleOwnerAdminRequest({
      authSupabase,
      serviceSupabase,
      body
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
