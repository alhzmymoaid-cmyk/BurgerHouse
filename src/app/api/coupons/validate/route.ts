import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseCustomerServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).origin !== request.nextUrl.origin) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const auth = createSupabaseCustomerServerClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user || !(user.app_metadata?.customer_account === true || Boolean(user.phone) || String(user.email || '').endsWith('@login.burgerhouse.invalid'))) return NextResponse.json({ error: 'CUSTOMER_AUTH_REQUIRED' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const branchId = typeof body.branch_id === 'string' ? body.branch_id : '';
  const subtotal = Number(body.subtotal);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code) || !branchId || !Number.isFinite(subtotal) || subtotal < 0) return NextResponse.json({ error: 'INVALID_COUPON_REQUEST', message_ar: 'تحقق من رمز الخصم والطلب.' }, { status: 400 });
  const service = createSupabaseServiceRoleClient();
  const { data: coupon, error } = await service.from('coupons').select('id,code,description_ar,discount_type,discount_value,minimum_order,max_discount,max_uses,used_count,starts_at,ends_at,branch_id,is_active').eq('code', code).maybeSingle();
  if (error) return NextResponse.json({ error: 'COUPON_LOOKUP_FAILED' }, { status: 500 });
  const now = Date.now();
  if (!coupon || !coupon.is_active || new Date(coupon.starts_at).getTime() > now || (coupon.ends_at && new Date(coupon.ends_at).getTime() <= now) || (coupon.branch_id && coupon.branch_id !== branchId) || (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses)) {
    return NextResponse.json({ error: 'COUPON_INVALID', message_ar: 'رمز الخصم غير صالح أو منتهي أو استُنفدت مرات استخدامه.' }, { status: 422 });
  }
  if (subtotal < Number(coupon.minimum_order)) return NextResponse.json({ error: 'COUPON_MINIMUM_NOT_MET', message_ar: 'قيمة الطلب أقل من الحد الأدنى لهذا الخصم.' }, { status: 422 });
  if (coupon.discount_type === 'percent' && Number(coupon.discount_value) > 100) return NextResponse.json({ error: 'COUPON_INVALID_DISCOUNT' }, { status: 422 });
  const rawDiscount = coupon.discount_type === 'percent' ? subtotal * Number(coupon.discount_value) / 100 : Math.min(subtotal, Number(coupon.discount_value));
  const discount = Number(Math.min(rawDiscount, Number(coupon.max_discount ?? subtotal), subtotal).toFixed(2));
  const { data: settings } = await service.from('system_settings').select('vat_percentage').eq('id', 1).single();
  const vatRate = Number(settings?.vat_percentage ?? 15) / 100;
  const vat = Number(((subtotal - discount) * vatRate).toFixed(2));
  const total = Number((subtotal - discount + vat).toFixed(2));
  return NextResponse.json({ ok: true, code: coupon.code, description_ar: coupon.description_ar || '', discount_amount: discount, vat_amount: vat, total_amount: total }, { headers: { 'Cache-Control': 'private, no-store' } });
}