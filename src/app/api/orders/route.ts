import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseCustomerServerClient, createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleCreateOrderRequest } from '@/lib/supabase/api-handlers.mjs';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';
import { sendBranchOrderPush } from '@/lib/web-push';

export async function POST(request: NextRequest) {
  try {
    const serviceSupabase = createSupabaseServiceRoleClient();
    const { data: siteSettings, error: siteSettingsError } = await serviceSupabase
      .from('system_settings').select('site_online,maintenance_mode,maintenance_message_ar').eq('id',1).single();
    if (siteSettingsError || !siteSettings || siteSettings.site_online === false || siteSettings.maintenance_mode === true) {
      return NextResponse.json({ error:'STORE_TEMPORARILY_UNAVAILABLE', message_ar:siteSettings?.maintenance_message_ar || 'لا نستقبل الطلبات في الوقت الحالي. نعود إليكم قريبًا.' }, { status:503 });
    }
    const idempotencyKey = request.headers.get('Idempotency-Key') || '';
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const sessionFingerprint = request.headers.get('x-bh-session') || request.cookies.get('bh_session_id')?.value || 'anon-session';
    const payload = await request.json();
    const authSupabase = createSupabaseCustomerServerClient();
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'CUSTOMER_LOGIN_REQUIRED', message_ar: 'سجّل الدخول أولاً لإتمام الطلب وحفظه في حسابك.' }, { status: 401 });
    }
    const isCustomerIdentity = user.app_metadata?.customer_account === true || Boolean(user.phone);
    if (!isCustomerIdentity) {
      return NextResponse.json({ error: 'CUSTOMER_SESSION_REQUIRED', message_ar: 'استخدم حساب العميل لإتمام الطلب. جلسة الموظفين والإدارة منفصلة.' }, { status: 403 });
    }
    const localizedPhone = String(payload?.customer_phone || '')
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
    const submittedPhone = localizedPhone.replace(/\D/g, '');
    const customerName = String(payload?.customer_name || '').trim();
    if (!/^9665\d{8}$/.test(submittedPhone)) {
      return NextResponse.json({ error: 'INVALID_CUSTOMER_PHONE', message_ar: 'أدخل رقم جوال سعودي صحيحاً يبدأ بـ 05.' }, { status: 400 });
    }
    if (customerName.length < 2 || customerName.length > 100) {
      return NextResponse.json({ error: 'INVALID_CUSTOMER_NAME', message_ar: 'أدخل الاسم الكامل بشكل صحيح.' }, { status: 400 });
    }

    // A phone/password customer identity is bound to server-managed app_metadata.
    // Legacy phone-auth users fall back to their verified Auth phone; older email accounts
    // fall back to their existing customer profile.
    let trustedPhone = String(user.app_metadata?.customer_phone || user.phone || '').replace(/\D/g, '');
    if (!trustedPhone) {
      const { data: existingProfile } = await serviceSupabase
        .from('customer_profiles')
        .select('phone')
        .eq('id', user.id)
        .maybeSingle();
      trustedPhone = String(existingProfile?.phone || '').replace(/\D/g, '');
    }
    if (trustedPhone && trustedPhone !== submittedPhone) {
      return NextResponse.json({ error: 'CUSTOMER_PHONE_MISMATCH', message_ar: 'استخدم رقم الجوال المرتبط بحسابك.' }, { status: 403 });
    }

    // Never overwrite the unique phone key during checkout. The phone is bound
    // to the authenticated customer identity; only update that user's display name.
    const { data: customerProfile, error: profileLookupError } = await serviceSupabase
      .from('customer_profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileLookupError) {
      console.error('Customer profile lookup failed during checkout:', profileLookupError.message);
    } else if (customerProfile) {
      const { error: profileUpdateError } = await serviceSupabase
        .from('customer_profiles')
        .update({ full_name: customerName, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (profileUpdateError) {
        console.error('Customer profile name update failed; continuing order:', {
          code: profileUpdateError.code,
          message: profileUpdateError.message,
        });
      }
    } else {
      const { error: profileInsertError } = await serviceSupabase
        .from('customer_profiles')
        .insert({ id: user.id, full_name: customerName, phone: '+' + submittedPhone });
      if (profileInsertError) {
        // A legacy profile may already own this unique phone. This must not block
        // a valid order; the order itself remains linked to the authenticated user.
        console.error('Customer profile insert skipped; continuing order:', {
          code: profileInsertError.code,
          message: profileInsertError.message,
        });
      }
    }

    const result = await handleCreateOrderRequest({
      serviceSupabase,
      idempotencyKey,
      clientIp,
      sessionFingerprint,
      payload,
      nowDate: new Date()
    });

    if (result.status >= 200 && result.status < 300 && result.body?.id) {
      await serviceSupabase.from('orders').update({ customer_id: user.id }).eq('id', result.body.id);
      const { data: savedOrder } = await serviceSupabase.from('orders').select('order_number').eq('id', result.body.id).maybeSingle();
      result.body.order_number = savedOrder?.order_number ?? null;
      delete result.body.tracking_token;
      // Best-effort branch-scoped push: never block the customer's order if a device is offline.
      try {
        const pushResult = await sendBranchOrderPush(serviceSupabase, String(payload.branch_id), {
          title: 'طلب جديد · BURGER HOUSE',
          body: 'وصل طلب جديد رقم ' + String(savedOrder?.order_number ?? result.body.order_code ?? ''),
          url: '/staff/orders',
          tag: 'bh-order-' + String(result.body.id)
        });
        if (!pushResult.configured || pushResult.sent === 0) {
          console.warn('New-order staff push was not delivered:', {
            configured: pushResult.configured,
            subscriptionsMatched: pushResult.sent + (pushResult.failed || 0)
          });
        }
      } catch (pushError: any) {
        console.error('New-order staff push failed:', { message: pushError?.message || 'unknown error' });
        // Order creation remains successful if push delivery is temporarily unavailable.
      }
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'ORDER_CREATION_ERROR', message: err?.message || 'Failed to process order' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authSupabase = createSupabaseServerClient();
    const authCheck = await requireAuthenticatedProfile(authSupabase, [
      'super_admin',
      'owner',
      'branch_manager',
      'cashier',
      'kitchen_staff'
    ]);
    if (!authCheck.ok) {
      return NextResponse.json({ error: authCheck.code }, { status: authCheck.status });
    }

    const profile = authCheck.profile;
    const requestedBranch = request.nextUrl.searchParams.get('branch_id');
    const statusFilter = request.nextUrl.searchParams.get('status');

    let query = authSupabase
      .from('orders')
      .select('*, order_items(*), order_status_history(*)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (['branch_manager', 'cashier', 'kitchen_staff'].includes(profile.role)) {
      query = query.eq('branch_id', profile.assigned_branch_id);
    } else if (requestedBranch && requestedBranch !== 'all') {
      query = query.eq('branch_id', requestedBranch);
    }

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ orders: data || [], actor_profile: profile });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
