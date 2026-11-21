import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';
import { handleOwnerAdminRequest } from '@/lib/supabase/api-handlers.mjs';

export const dynamic = 'force-dynamic';

async function authorizeCatalogManager() {
  const auth = createSupabaseServerClient();
  const check = await requireAuthenticatedProfile(auth, ['super_admin', 'owner', 'branch_manager']);
  if (!check.ok) return { auth, check, response: NextResponse.json({ error: check.code, message: check.message }, { status: check.status }) };
  const permitted = ['super_admin', 'owner'].includes(check.profile.role)
    || (check.profile.role === 'branch_manager' && Array.isArray(check.profile.permissions) && check.profile.permissions.includes('catalog_manage'));
  if (!permitted) return { auth, check, response: NextResponse.json({ error: 'CATALOG_MANAGEMENT_PERMISSION_REQUIRED', message_ar: 'حسابك لا يملك صلاحية إدارة المنيو. اطلب من مدير النظام تفعيل صلاحية إدارة المنيو لهذا الحساب.' }, { status: 403 }) };
  return { auth, check, response: null };
}

export async function GET() {
  try {
    const { check, response } = await authorizeCatalogManager();
    if (response) return response;
    const service = createSupabaseServiceRoleClient();
    const [products, categories, addons, settings] = await Promise.all([
      service.from('products').select('*, product_sizes(*)').order('sort_order', { ascending: true }),
      service.from('categories').select('*').order('sort_order', { ascending: true }),
      service.from('product_addons').select('*').order('name_ar', { ascending: true }),
      check.profile.role === 'branch_manager'
        ? Promise.resolve({ data: null, error: null } as any)
        : service.from('system_settings').select('draft_theme,published_theme').eq('id', 1).single()
    ]);
    const error = products.error || categories.error || addons.error || settings.error;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      profile: check.profile,
      products: products.data || [],
      categories: categories.data || [],
      addons: addons.data || [],
      settings: settings.data || null
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'CATALOG_ADMIN_LOAD_FAILED' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { auth, response } = await authorizeCatalogManager();
    if (response) return response;
    const body = await request.json().catch(() => ({}));
    const result = await handleOwnerAdminRequest({
      authSupabase: auth,
      serviceSupabase: createSupabaseServiceRoleClient(),
      body
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'CATALOG_ADMIN_ACTION_FAILED' }, { status: 500 });
  }
}
