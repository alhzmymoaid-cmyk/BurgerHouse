import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const [settingsRes, branchesRes, categoriesRes, productsRes, sizesRes, addonsRes, overridesRes, paymentsRes, promosRes] =
      await Promise.all([
        supabase.from('system_settings').select('*').eq('id', 1).single(),
        supabase.from('branches').select('*').eq('is_active', true).order('created_at', { ascending: true }),
        supabase.from('categories').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('products').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('product_sizes').select('*').order('sort_order', { ascending: true }),
        supabase.from('product_addons').select('*').eq('is_active', true),
        supabase.from('branch_product_overrides').select('*'),
        supabase.from('payment_methods').select('*').eq('is_enabled', true).order('sort_order', { ascending: true }),
        supabase.from('promotions').select('*').eq('is_active', true)
      ]);

    return NextResponse.json({
      settings: settingsRes.data,
      branches: branchesRes.data || [],
      categories: categoriesRes.data || [],
      products: (productsRes.data || []).map((p: any) => ({
        ...p,
        sizes: (sizesRes.data || []).filter((s: any) => s.product_id === p.id)
      })),
      addons: addonsRes.data || [],
      branch_overrides: overridesRes.data || [],
      payment_methods: paymentsRes.data || [],
      promotions: promosRes.data || []
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'CATALOG_FETCH_ERROR', message: err?.message }, { status: 500 });
  }
}
