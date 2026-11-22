import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireBranchManager() {
  const auth = createSupabaseServerClient();
  const access = await requireAuthenticatedProfile(auth, ['branch_manager']);
  if (!access.ok) {
    return { response: NextResponse.json({ error: access.code }, { status: access.status }) } as const;
  }
  if (!access.profile.assigned_branch_id) {
    return { response: NextResponse.json({ error: 'BRANCH_NOT_ASSIGNED' }, { status: 403 }) } as const;
  }
  return { profile: access.profile, service: createSupabaseServiceRoleClient() } as const;
}

export async function GET() {
  const access = await requireBranchManager();
  if ('response' in access) return access.response;

  const { data, error } = await access.service
    .from('branches')
    .select('id,name_ar,open_time,close_time,closed_days,is_accepting_orders')
    .eq('id', access.profile.assigned_branch_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'BRANCH_HOURS_READ_FAILED' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'BRANCH_NOT_FOUND' }, { status: 404 });

  return NextResponse.json({ branch: data }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest) {
  const access = await requireBranchManager();
  if ('response' in access) return access.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body, 'open_time')) {
    if (typeof body.open_time !== 'string' || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(body.open_time)) {
      return NextResponse.json({ error: 'INVALID_OPEN_TIME' }, { status: 400 });
    }
    update.open_time = body.open_time;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'close_time')) {
    if (typeof body.close_time !== 'string' || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(body.close_time)) {
      return NextResponse.json({ error: 'INVALID_CLOSE_TIME' }, { status: 400 });
    }
    update.close_time = body.close_time;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'closed_days')) {
    if (!Array.isArray(body.closed_days) || body.closed_days.some((day: unknown) => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6)) {
      return NextResponse.json({ error: 'INVALID_CLOSED_DAYS' }, { status: 400 });
    }
    update.closed_days = [...new Set(body.closed_days as number[])].sort((a, b) => a - b);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'is_accepting_orders')) {
    if (typeof body.is_accepting_orders !== 'boolean') {
      return NextResponse.json({ error: 'INVALID_ORDER_AVAILABILITY' }, { status: 400 });
    }
    update.is_accepting_orders = body.is_accepting_orders;
  }

  const allowedKeys = ['open_time', 'close_time', 'closed_days', 'is_accepting_orders'];
  if (!allowedKeys.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    return NextResponse.json({ error: 'NO_VALID_CHANGES' }, { status: 400 });
  }

  const { data, error } = await access.service
    .from('branches')
    .update(update)
    .eq('id', access.profile.assigned_branch_id)
    .select('id,name_ar,open_time,close_time,closed_days,is_accepting_orders')
    .single();

  if (error) return NextResponse.json({ error: 'BRANCH_HOURS_UPDATE_FAILED' }, { status: 400 });

  await access.service.from('audit_logs').insert({
    actor_id: access.profile.id,
    actor_name: access.profile.full_name,
    actor_role: access.profile.role,
    action: 'BRANCH_OPERATING_HOURS_UPDATED',
    target_type: 'branch',
    target_id: access.profile.assigned_branch_id,
    metadata: { changed_fields: Object.keys(update).filter((key) => key !== 'updated_at'), values: update }
  });

  return NextResponse.json({ ok: true, branch: data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
