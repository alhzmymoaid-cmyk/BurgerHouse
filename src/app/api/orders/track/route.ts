import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleTrackOrderRequest } from '@/lib/supabase/api-handlers.mjs';

export async function POST(request: NextRequest) {
  try {
    const serviceSupabase = createSupabaseServiceRoleClient();
    const body = await request.json().catch(() => ({}));
    const result = await handleTrackOrderRequest({
      serviceSupabase,
      orderCode: body.order_code,
      trackingToken: body.tracking_token
    });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

// Security Hardening: Forbid passing tracking tokens in GET URL query parameters
export async function GET() {
  return NextResponse.json(
    {
      error: 'METHOD_NOT_ALLOWED_USE_POST',
      message_ar: 'لأسباب أمنية ولمنع تسرب رمز التتبع في سجلات المتصفح والخادم، يُمنع إرسال رمز التتبع عبر روابط GET. استخدم طلب POST فقط.'
    },
    {
      status: 405,
      headers: { Allow: 'POST' }
    }
  );
}
