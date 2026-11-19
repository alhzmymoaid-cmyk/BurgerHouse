import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, timingSafeEqual } from 'crypto';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const branches = [
  { id: 'br-jed-sultan', code: 'sultan', name: 'فرع طريق الأمير سلطان', email: 'manager.sultan@burgerhouse.test' },
  { id: 'br-jed-hamra', code: 'hamra', name: 'فرع كورنيش الحمراء', email: 'manager.hamra@burgerhouse.test' },
  { id: 'br-riy-tahlia', code: 'tahlia', name: 'فرع شارع التحلية', email: 'manager.tahlia@burgerhouse.test' },
  { id: 'br-jed-obhur', code: 'obhur', name: 'فرع أبحر الشمالية', email: 'manager.obhur@burgerhouse.test' }
];

function makePassword() {
  return randomBytes(18).toString('base64url');
}

export async function GET(request: NextRequest) {
  const expected = process.env.DEMO_ACCOUNTS_BOOTSTRAP_TOKEN || '';
  const supplied = request.nextUrl.searchParams.get('token') || '';
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (!expected || a.length < 48 || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { count, error: countError } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true });
  if (countError) {
    return NextResponse.json({ error: 'PROFILE_CHECK_FAILED', detail: countError.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  if ((count || 0) > 0) {
    return NextResponse.json({ error: 'BOOTSTRAP_LOCKED', message: 'Profiles already exist; no demo accounts were created.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }

  const definitions: Array<{ email: string; name: string; role: string; branchId: string | null }> = [
    { email: 'superadmin@burgerhouse.test', name: 'مدير النظام الأعلى', role: 'super_admin', branchId: null }
  ];
  for (const branch of branches) {
    definitions.push(
      { email: branch.email, name: 'مدير ' + branch.name, role: 'branch_manager', branchId: branch.id },
      { email: 'cashier1.' + branch.code + '@burgerhouse.test', name: 'موظف استقبال 1 — ' + branch.name, role: 'cashier', branchId: branch.id },
      { email: 'cashier2.' + branch.code + '@burgerhouse.test', name: 'موظف استقبال 2 — ' + branch.name, role: 'cashier', branchId: branch.id },
      { email: 'kitchen.' + branch.code + '@burgerhouse.test', name: 'موظف المطبخ — ' + branch.name, role: 'kitchen_staff', branchId: branch.id }
    );
  }

  const created: Array<{ id: string; email: string; password: string; name: string; role: string; branch_id: string | null }> = [];
  try {
    for (const item of definitions) {
      const password = makePassword();
      const { data, error } = await supabase.auth.admin.createUser({
        email: item.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: item.name }
      });
      if (error || !data.user) throw new Error('AUTH_USER_CREATE_FAILED:' + (error?.message || item.email));
      const profile = {
        id: data.user.id,
        email: item.email,
        full_name: item.name,
        role: item.role,
        assigned_branch_id: item.branchId,
        is_active: true,
        permissions: []
      };
      const { error: profileError } = await supabase.from('user_profiles').insert(profile);
      if (profileError) {
        await supabase.auth.admin.deleteUser(data.user.id);
        throw new Error('PROFILE_CREATE_FAILED:' + profileError.message);
      }
      created.push({ id: data.user.id, email: item.email, password, name: item.name, role: item.role, branch_id: item.branchId });
    }
  } catch (error) {
    for (const item of created.reverse()) {
      await supabase.from('user_profiles').delete().eq('id', item.id);
      await supabase.auth.admin.deleteUser(item.id);
    }
    return NextResponse.json({ error: 'DEMO_BOOTSTRAP_FAILED', detail: error instanceof Error ? error.message : 'Unknown error', rolled_back: true }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({
    ok: true,
    created_count: created.length,
    warning: 'Save these credentials now. Passwords are shown once and cannot be retrieved later.',
    accounts: created.map(({ email, password, name, role, branch_id }) => ({ email, password, name, role, branch_id }))
  }, { status: 201, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } });
}
