import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).origin !== request.nextUrl.origin) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const auth = createSupabaseServerClient();
  const checked = await requireAuthenticatedProfile(auth, ['branch_manager']);
  if (!checked.ok) return NextResponse.json({ error: checked.code }, { status: checked.status });
  if (!checked.profile?.assigned_branch_id) return NextResponse.json({ error: 'BRANCH_NOT_ASSIGNED' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.is_active !== 'boolean') return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.from('coupons')
    .update({ is_active: body.is_active })
    .eq('id', context.params.id)
    .eq('branch_id', checked.profile.assigned_branch_id)
    .select('id,is_active')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'COUPON_UPDATE_FAILED' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'COUPON_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ coupon: data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
