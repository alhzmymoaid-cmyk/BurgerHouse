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

    const targetStatus = String(body?.target_status || '');
    const customerNotice: Record<string, { title: string; body: (number: unknown) => string }> = {
      preparing: {
        title: 'بدأ تجهيز طلبك',
        body: (number) => `بدأ الفرع تجهيز طلبك رقم #${number} الآن.`
      },
      ready_for_pickup: {
        title: 'طلبك جاهز للاستلام',
        body: (number) => `طلبك رقم #${number} جاهز. يمكنك التوجه إلى الفرع لاستلامه.`
      },
      completed: {
        title: 'تم استلام طلبك',
        body: (number) => `تم تسجيل استلام الطلب رقم #${number}. شكرًا لزيارتك BURGER HOUSE.`
      }
    };
    if (result.status === 200 && customerNotice[targetStatus]) {
      try {
        const { data: order } = await serviceSupabase.from('orders')
          .select('id,customer_id,order_number')
          .eq('order_code', String(params.code).toUpperCase())
          .maybeSingle();
        if (order?.customer_id) {
          const notice = customerNotice[targetStatus];
          await sendCustomerOrderPush(serviceSupabase, order.customer_id, {
            title: notice.title,
            body: notice.body(order.order_number),
            url: `/orders/${order.id}`,
            tag: `bh-order-${targetStatus}-${order.id}`
          });
        }
      } catch (pushError) {
        console.error('Customer order status notification failed:', pushError);
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
