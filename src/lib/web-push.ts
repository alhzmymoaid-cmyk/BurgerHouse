import webpush from 'web-push';

let configured = false;

export function getWebPushClient() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.WEB_PUSH_SUBJECT || 'https://burgerhouse-resto-saa-s.vercel.app',
      publicKey,
      privateKey
    );
    configured = true;
  }
  return webpush;
}

export async function sendBranchOrderPush(
  serviceSupabase: any,
  branchId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
) {
  const client = getWebPushClient();
  if (!client) return { sent: 0, configured: false };
  const { data: subscriptions, error } = await serviceSupabase
    .from('staff_push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('branch_id', branchId);
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  await Promise.all((subscriptions || []).map(async (subscription: any) => {
    try {
      await client.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        { TTL: 60, urgency: 'high' }
      );
      sent += 1;
    } catch (error: any) {
      failed += 1;
      console.error('Staff Web Push delivery failed:', { statusCode: error?.statusCode || null });
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await serviceSupabase.from('staff_push_subscriptions').delete().eq('endpoint', subscription.endpoint);
      }
    }
  }));
  return { sent, failed, configured: true };
}

export async function sendCustomerOrderPush(
  serviceSupabase: any,
  customerId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
) {
  const client = getWebPushClient();
  if (!client) return { sent: 0, configured: false };
  const { data: subscriptions, error } = await serviceSupabase
    .from('customer_push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('customer_id', customerId);
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  await Promise.all((subscriptions || []).map(async (subscription: any) => {
    try {
      await client.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60, urgency: 'high' }
      );
      sent += 1;
    } catch (error: any) {
      failed += 1;
      console.error('Customer Web Push delivery failed:', { statusCode: error?.statusCode || null });
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await serviceSupabase.from('customer_push_subscriptions').delete()
          .eq('endpoint', subscription.endpoint).eq('customer_id', customerId);
      }
    }
  }));
  return { sent, failed, configured: true };
}
