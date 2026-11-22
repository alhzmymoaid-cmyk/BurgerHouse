import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

export const runtime = 'nodejs';

async function requireBranchManager() {
  const auth = createSupabaseServerClient();
  const checked = await requireAuthenticatedProfile(auth, ['branch_manager']);
  if (!checked.ok) return { response: NextResponse.json({ error: checked.code }, { status: checked.status }) };
  if (!checked.profile?.assigned_branch_id) {
    return { response: NextResponse.json({ error: 'BRANCH_NOT_ASSIGNED' }, { status: 403 }) };
  }
  return { profile: checked.profile, service: createSupabaseServiceRoleClient() };
}

export async function GET() {
  const access = await requireBranchManager();
  if (access.response) return access.response;
  const { data, error } = await access.service
    .from('coupons')
    .select('id,code,description_ar,discount_type,discount_value,minimum_order,max_discount,starts_at,ends_at,is_active,used_count,created_at')
    .eq('branch_id', access.profile.assigned_branch_id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'COUPONS_READ_FAILED' }, { status: 500 });
  return NextResponse.json({ coupons: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  }
  const access = await requireBranchManager();
  if (access.response) return access.response;
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const description = typeof body.description_ar === 'string' ? body.description_ar.trim() : '';
  const discount = Number(body.discount_value);
  const minimum = Number(body.minimum_order);
  const maximum = Number(body.max_discount);
  const startsAt = typeof body.starts_at === 'string' ? new Date(body.starts_at) : null;
  const endsAt = typeof body.ends_at === 'string' ? new Date(body.ends_at) : null;

  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return NextResponse.json({ error: 'INVALID_CODE', message_ar: 'اكتب كودًا من 3 إلى 32 حرفًا أو رقمًا.' }, { status: 400 });
  }
  if (description.length < 2 || description.length > 100) {
    return NextResponse.json({ error: 'INVALID_DESCRIPTION', message_ar: 'اكتب وصف الخصم من حرفين إلى 100 حرف.' }, { status: 400 });
  }
  if (!Number.isFinite(discount) || discount <= 0 || discount > 100 ||
      !Number.isFinite(minimum) || minimum < 0 ||
      !Number.isFinite(maximum) || maximum <= 0 ||
      !startsAt || Number.isNaN(startsAt.getTime()) ||
      !endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: 'INVALID_COUPON_SETTINGS', message_ar: 'تحقق من النسبة والحد الأدنى وأقصى الخصم ومدة الكوبون.' }, { status: 400 });
  }

  const { data, error } = await access.service.from('coupons').insert({
    code,
    description_ar: description,
    discount_type: 'percent',
    discount_value: discount,
    minimum_order: minimum,
    max_discount: maximum,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    branch_id: access.profile.assigned_branch_id,
    created_by: access.profile.id,
    is_active: true
  }).select('id,code,description_ar,discount_type,discount_value,minimum_order,max_discount,starts_at,ends_at,is_active,used_count,created_at').single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'COUPON_CODE_EXISTS', message_ar: 'هذا الكود مستخدم بالفعل، اختر كودًا آخر.' }, { status: 409 });
    return NextResponse.json({ error: 'COUPON_CREATE_FAILED', message_ar: 'تعذر إنشاء الكوبون حاليًا.' }, { status: 500 });
  }
  return NextResponse.json({ coupon: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
}
