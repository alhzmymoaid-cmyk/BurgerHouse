import { NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';
import { getWebPushClient } from '@/lib/web-push';

export async function POST() {
  try {
    const auth = createSupabaseServerClient();
    const access = await requireAuthenticatedProfile(auth, ['super_admin', 'owner', 'branch_manager', 'cashier', 'kitchen_staff']);
    if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });
    const client = getWebPushClient();
    if (!client) return NextResponse.json({ error: 'PUSH_NOT_CONFIGURED' }, { status: 503 });
    const { data: { user } } = await auth.auth.getUser();
    const service = createSupabaseServiceRoleClient();
    const { data: subscriptions, error } = await service.from('staff_push_subscriptions')
      .select('endpoint,p256dh,auth').eq('user_id', user!.id);
    if (error) throw error;
    if (!subscriptions?.length) return NextResponse.json({ error: 'NO_PUSH_SUBSCRIPTION' }, { status: 404 });
    const results = await Promise.all(subscriptions.map(async (sub: any) => {
      try {
        await client.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: 'BURGER HOUSE', body: 'تم تفعيل تنبيه الطلبات على هذا الجهاز.', url: '/staff/orders', tag: 'bh-push-test' }),
          { TTL: 60, urgency: 'high' }
        );
        return true;
      } catch (sendError: any) {
        if (sendError?.statusCode === 404 || sendError?.statusCode === 410) {
          await service.from('staff_push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
        return false;
      }
    }));
    return NextResponse.json({ ok: results.some(Boolean), sent: results.filter(Boolean).length });
  } catch (error: any) {
    return NextResponse.json({ error: 'PUSH_TEST_FAILED', message: error?.message || 'تعذر إرسال إشعار الاختبار.' }, { status: 500 });
  }
}
