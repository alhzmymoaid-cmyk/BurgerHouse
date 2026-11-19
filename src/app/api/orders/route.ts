import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleCreateOrderRequest } from '@/lib/supabase/api-handlers.mjs';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

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
    const { data: customerProfile } = await serviceSupabase
      .from('customer_profiles').select('phone').eq('id', user.id).maybeSingle();
    const submittedPhone = String(payload?.customer_phone || '').replace(/\\D/g, '');
    const accountPhone = String(customerProfile?.phone || user.phone || '').replace(/\\D/g, '');
    if (!accountPhone || submittedPhone !== accountPhone) {
      return NextResponse.json({ error: 'CUSTOMER_PHONE_MISMATCH', message_ar: 'رقم الجوال لا يطابق رقم حسابك.' }, { status: 403 });
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

    // Enforce strict server-side branch scoping for staff roles
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
