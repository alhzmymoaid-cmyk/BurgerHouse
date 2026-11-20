import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleCreateOrderRequest } from '@/lib/supabase/api-handlers.mjs';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';\nimport { sendBranchOrderPush } from '@/lib/web-push';

export async function POST(request: NextRequest) {
  try {
    const serviceSupabase = createSupabaseServiceRoleClient();
    const idempotencyKey = request.headers.get('Idempotency-Key') || '';
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const sessionFingerprint = request.headers.get('x-bh-session') || request.cookies.get('bh_session_id')?.value || 'anon-session';
    const payload = await request.json();
    const authSupabase = createSupabaseServerClient();
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'CUSTOMER_LOGIN_REQUIRED', message_ar: 'سجّل الدخول أولاً لإتمام الطلب وحفظه في حسابك.' }, { status: 401 });
    }
    const submittedPhone = String(payload?.customer_phone || '').replace(/\D/g, '');
    const customerName = String(payload?.customer_name || '').trim();
    if (!/^9665\d{8}$/.test(submittedPhone)) {
      return NextResponse.json({ error: 'INVALID_CUSTOMER_PHONE', message_ar: 'أدخل رقم جوال سعودي صحيحاً يبدأ بـ 05.' }, { status: 400 });
    }
    if (customerName.length < 2 || customerName.length > 100) {
      return NextResponse.json({ error: 'INVALID_CUSTOMER_NAME', message_ar: 'أدخل الاسم الكامل بشكل صحيح.' }, { status: 400 });
    }

    // Save checkout details to the signed-in customer's profile before creating the order.
    // This repairs older customer accounts with a missing profile phone.
    if (user.phone) {
      const authPhone = String(user.phone).replace(/\D/g, '');
      if (authPhone && authPhone !== submittedPhone) {
        return NextResponse.json({ error: 'CUSTOMER_PHONE_MISMATCH', message_ar: 'استخدم رقم الجوال المرتبط بحسابك.' }, { status: 403 });
      }
    }
    const { error: profileError } = await serviceSupabase
      .from('customer_profiles')
      .upsert({ id: user.id, full_name: customerName, phone: '+' + submittedPhone }, { onConflict: 'id' });
    if (profileError) {
      return NextResponse.json({ error: 'CUSTOMER_PROFILE_SAVE_FAILED', message_ar: 'تعذر حفظ بيانات الحساب. حاول مرة أخرى.' }, { status: 500 });
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
        await sendBranchOrderPush(serviceSupabase, String(payload.branch_id), {
          title: 'طلب جديد · BURGER HOUSE',
          body: 'وصل طلب جديد رقم ' + String(savedOrder?.order_number ?? result.body.order_code ?? ''),
          url: '/staff/orders',
          tag: 'bh-order-' + String(result.body.id)
        });
      } catch {
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
