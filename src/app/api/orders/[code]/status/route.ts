import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleTransitionOrderStatusRequest } from '@/lib/supabase/api-handlers.mjs';
import { sendCustomerOrderPush } from '@/lib/web-push';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const authSupabase = createSupabaseServerClient();
    const serviceSupabase = createSupabaseServiceRoleClient();
    const body = await request.json().catch(() => ({}));

    const result = await handleTransitionOrderStatusRequest({
      authSupabase,
      serviceSupabase,
      orderCode: params.code,
      body
    });

    if (result.status === 200 && body?.target_status === 'ready_for_pickup') {
      try {
        const { data: order } = await serviceSupabase.from('orders')
          .select('id,customer_id,order_number')
          .eq('order_code', String(params.code).toUpperCase())
          .maybeSingle();
        if (order?.customer_id) {
          await sendCustomerOrderPush(serviceSupabase, order.customer_id, {
            title: 'طلبك جاهز للاستلام',
            body: `طلبك رقم #${order.order_number} جاهز للاستلام من الفرع.`,
            url: `/orders/${order.id}`,
            tag: `bh-order-ready-${order.id}`
          });
        }
      } catch (pushError) {
        console.error('Customer ready notification failed:', pushError);
      }
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'STATUS_UPDATE_FAILED', message: err?.message },
      { status: 500 }
    );
  }
}
