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

    const result = await handleCreateOrderRequest({
      serviceSupabase,
      idempotencyKey,
      clientIp,
      sessionFingerprint,
      payload,
      nowDate: new Date()
    });

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
