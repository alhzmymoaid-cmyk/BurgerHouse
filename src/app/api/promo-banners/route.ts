import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

export const dynamic = 'force-dynamic';

const elevated = (role: string) => role === 'super_admin' || role === 'owner';
const allowed = (profile: any, branchId: string | null) =>
  elevated(profile.role) || (profile.role === 'branch_manager' && !!profile.assigned_branch_id && branchId === profile.assigned_branch_id);

export async function GET() {
  const auth = createSupabaseServerClient();
  const check = await requireAuthenticatedProfile(auth, ['super_admin','owner','branch_manager']);
  if (!check.ok) return NextResponse.json({ error: check.code }, { status: check.status });
  const service = createSupabaseServiceRoleClient();
  let query = service.from('promo_banners').select('*').order('sort_order').order('created_at',{ascending:false});
  if (check.profile.role === 'branch_manager') query = query.eq('branch_id', check.profile.assigned_branch_id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ promo_banners: data || [], profile: check.profile }, { headers: { 'Cache-Control':'no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = createSupabaseServerClient();
  const check = await requireAuthenticatedProfile(auth, ['super_admin','owner','branch_manager']);
  if (!check.ok) return NextResponse.json({ error: check.code }, { status: check.status });
  const body = await request.json().catch(() => ({}));
  const branchId = elevated(check.profile.role) ? (body.branch_id || null) : check.profile.assigned_branch_id;
  if (!allowed(check.profile, branchId)) return NextResponse.json({ error:'BRANCH_SCOPE_FORBIDDEN' }, { status:403 });
  if (!body.image_url?.trim()) {
    return NextResponse.json({ error:'PROMO_IMAGE_REQUIRED' }, { status:400 });
  }
  const service = createSupabaseServiceRoleClient();
  const payload = {
    branch_id: branchId, title_ar: String(body.title_ar || 'إعلان').trim(), title_en: body.title_en || null,
    subtitle_ar: body.subtitle_ar || null, subtitle_en: body.subtitle_en || null,
    image_url: String(body.image_url).trim(), badge_text: body.badge_text || 'عرض اليوم',
    cta_label: body.cta_label || 'اطلب الآن', target_url: body.target_url || '#menu-section',
    target_product_id: body.target_product_id || null, target_category_id: body.target_category_id || null,
    starts_at: body.starts_at || new Date().toISOString(), ends_at: body.ends_at || null,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    is_active: body.is_active !== false, created_by: check.profile.id, created_by_role: check.profile.role, updated_at: new Date().toISOString()
  };
  const { data, error } = await service.from('promo_banners').insert(payload).select('*').single();
  if (error) return NextResponse.json({ error:error.message }, { status:400 });
  await service.from('audit_logs').insert({ actor_id:check.profile.id,actor_name:check.profile.full_name,actor_role:check.profile.role,action:'PROMO_BANNER_CREATED',target_type:'promo_banner',target_id:data.id,metadata:{branch_id:branchId,title_ar:payload.title_ar} });
  return NextResponse.json({ promo_banner:data }, { status:201 });
}

export async function PATCH(request: NextRequest) {
  const auth = createSupabaseServerClient();
  const check = await requireAuthenticatedProfile(auth, ['super_admin','owner','branch_manager']);
  if (!check.ok) return NextResponse.json({ error:check.code }, { status:check.status });
  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error:'BANNER_ID_REQUIRED' }, { status:400 });
  const service = createSupabaseServiceRoleClient();
  const { data: existing, error: lookupError } = await service.from('promo_banners').select('*').eq('id',body.id).maybeSingle();
  if (lookupError || !existing) return NextResponse.json({ error:'BANNER_NOT_FOUND' }, { status:404 });
  if (!allowed(check.profile, existing.branch_id)) return NextResponse.json({ error:'BRANCH_SCOPE_FORBIDDEN' }, { status:403 });
  const patch: Record<string,unknown> = {};
  for (const key of ['title_ar','title_en','subtitle_ar','subtitle_en','image_url','badge_text','cta_label','target_url','target_product_id','target_category_id','starts_at','ends_at','sort_order','is_active']) {
    if (Object.prototype.hasOwnProperty.call(body,key)) patch[key] = body[key];
  }
  if (elevated(check.profile.role) && Object.prototype.hasOwnProperty.call(body,'branch_id')) patch.branch_id = body.branch_id || null;
  if (check.profile.role === 'branch_manager' && existing.branch_id !== check.profile.assigned_branch_id) return NextResponse.json({ error:'BRANCH_SCOPE_FORBIDDEN' }, { status:403 });
  patch.updated_at = new Date().toISOString();
  const { data, error } = await service.from('promo_banners').update(patch).eq('id',body.id).select('*').single();
  if (error) return NextResponse.json({ error:error.message }, { status:400 });
  await service.from('audit_logs').insert({ actor_id:check.profile.id,actor_name:check.profile.full_name,actor_role:check.profile.role,action:'PROMO_BANNER_UPDATED',target_type:'promo_banner',target_id:data.id,metadata:{changed_fields:Object.keys(patch)} });
  return NextResponse.json({ promo_banner:data });
}

export async function DELETE(request: NextRequest) {
  const auth = createSupabaseServerClient();
  const check = await requireAuthenticatedProfile(auth, ['super_admin','owner','branch_manager']);
  if (!check.ok) return NextResponse.json({ error:check.code }, { status:check.status });
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error:'BANNER_ID_REQUIRED' }, { status:400 });
  const service = createSupabaseServiceRoleClient();
  const { data: existing } = await service.from('promo_banners').select('id,branch_id,title_ar').eq('id',id).maybeSingle();
  if (!existing) return NextResponse.json({ error:'BANNER_NOT_FOUND' }, { status:404 });
  if (!allowed(check.profile, existing.branch_id)) return NextResponse.json({ error:'BRANCH_SCOPE_FORBIDDEN' }, { status:403 });
  const { error } = await service.from('promo_banners').delete().eq('id',id);
  if (error) return NextResponse.json({ error:error.message }, { status:400 });
  await service.from('audit_logs').insert({ actor_id:check.profile.id,actor_name:check.profile.full_name,actor_role:check.profile.role,action:'PROMO_BANNER_DELETED',target_type:'promo_banner',target_id:id,metadata:{title_ar:existing.title_ar,branch_id:existing.branch_id} });
  return NextResponse.json({ success:true });
}
