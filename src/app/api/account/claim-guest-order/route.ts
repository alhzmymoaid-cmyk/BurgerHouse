import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseCustomerServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const orderCode = String(body?.order_code || '').trim().toUpperCase();
    const trackingToken = String(body?.tracking_token || '').trim();

    if (!orderCode || orderCode.length > 40 || !trackingToken.startsWith('trk_') || trackingToken.length < 24 || trackingToken.length > 256) {
      return NextResponse.json({ error: 'INVALID_ORDER_CLAIM_CREDENTIALS', message_ar: 'تحقق من رقم الطلب ورمز التتبع.' }, { status: 400 });
    }

    const supabase = createSupabaseCustomerServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.app_metadata?.customer_account !== true) {
      return NextResponse.json({ error: 'CUSTOMER_AUTH_REQUIRED', message_ar: 'سجّل الدخول إلى حساب العميل أولاً.' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('claim_guest_orders_by_phone', {
      p_order_code: orderCode,
      p_tracking_token: trackingToken,
    });

    if (error || !data?.ok) {
      return NextResponse.json({
        error: 'GUEST_ORDER_CLAIM_FAILED',
        message_ar: 'لم نتمكن من التحقق من ملكية هذا الطلب. تأكد من رقم الطلب ورمز التتبع.',
      }, { status: 403 });
    }

    return NextResponse.json({ ok: true, already_claimed: Boolean(data.already_claimed) }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'ORDER_CLAIM_ERROR', message_ar: 'تعذر ربط الطلب الآن. حاول لاحقًا.' }, { status: 500 });
  }
}
