import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

const STAFF_ROLES = ['super_admin', 'owner', 'branch_manager', 'cashier', 'kitchen_staff'];

export async function POST(request: NextRequest) {
  try {
    const auth = createSupabaseServerClient();
    const access = await requireAuthenticatedProfile(auth, STAFF_ROLES);
    if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });
    const body = await request.json();
    const subscription = body?.subscription;
    const endpoint = String(subscription?.endpoint || '');
    const p256dh = String(subscription?.keys?.p256dh || '');
    const authKey = String(subscription?.keys?.auth || '');
    if (!endpoint.startsWith('https://') || !p256dh || !authKey) {
      return NextResponse.json({ error: 'INVALID_PUSH_SUBSCRIPTION', message: 'بيانات الإشعار غير مكتملة.' }, { status: 400 });
    }

    const profile = access.profile;
    const requestedBranch = String(body?.branch_id || '');
    const branchId = profile.assigned_branch_id || requestedBranch;
    if (!branchId || (profile.assigned_branch_id && requestedBranch && requestedBranch !== profile.assigned_branch_id)) {
      return NextResponse.json({ error: 'BRANCH_SCOPE_INVALID' }, { status: 403 });
    }

    const service = createSupabaseServiceRoleClient();
    const { data: branch, error: branchError } = await service
      .from('branches').select('id,is_active').eq('id', branchId).maybeSingle();
    if (branchError || !branch?.is_active) {
      return NextResponse.json({ error: 'BRANCH_NOT_FOUND' }, { status: 400 });
    }

    const { error } = await service.from('staff_push_subscriptions').upsert({
      user_id: (await auth.auth.getUser()).data.user!.id,
      branch_id: branchId,
      endpoint,
      p256dh,
      auth: authKey,
      updated_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    return NextResponse.json({ ok: true, branch_id: branchId });
  } catch (error: any) {
    return NextResponse.json({ error: 'PUSH_SUBSCRIBE_FAILED', message: error?.message || 'تعذر تفعيل الإشعارات.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = createSupabaseServerClient();
    const access = await requireAuthenticatedProfile(auth, STAFF_ROLES);
    if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });
    const body = await request.json();
    const endpoint = String(body?.endpoint || '');
    if (!endpoint.startsWith('https://')) return NextResponse.json({ error: 'INVALID_ENDPOINT' }, { status: 400 });
    const { data: { user } } = await auth.auth.getUser();
    const service = createSupabaseServiceRoleClient();
    const { error } = await service.from('staff_push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user!.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'PUSH_UNSUBSCRIBE_FAILED', message: error?.message || 'تعذر إيقاف الإشعارات.' }, { status: 500 });
  }
}
