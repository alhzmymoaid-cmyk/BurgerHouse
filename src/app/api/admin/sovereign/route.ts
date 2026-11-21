import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { handleSovereignAdminRequest } from '@/lib/supabase/api-handlers.mjs';
import { requireAuthenticatedProfile } from '@/lib/supabase/auth-guard.mjs';

export async function GET() {
  try {
    const authSupabase = createSupabaseServerClient();
    const authCheck = await requireAuthenticatedProfile(authSupabase, ['super_admin']);
    if (!authCheck.ok) {
      return NextResponse.json({ error: authCheck.code, message: authCheck.message }, { status: authCheck.status });
    }

    const serviceSupabase = createSupabaseServiceRoleClient();
    const [settingsRes, profilesRes, branchesRes, blockedRes, abuseRes, auditRes] = await Promise.all([
      serviceSupabase.from('system_settings').select('*').eq('id', 1).single(),
      serviceSupabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
      serviceSupabase.from('branches').select('id,name_ar').order('name_ar', { ascending: true }),
      serviceSupabase.from('blocked_entities').select('*').order('created_at', { ascending: false }),
      serviceSupabase.from('security_abuse_logs').select('*').order('created_at', { ascending: false }).limit(100),
      serviceSupabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100)
    ]);

    return NextResponse.json({
      super_admin: authCheck.profile,
      settings: settingsRes.data,
      user_profiles: profilesRes.data || [],
      branches: branchesRes.data || [],
      blocked_entities: blockedRes.data || [],
      security_abuse_logs: abuseRes.data || [],
      audit_logs: auditRes.data || []
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authSupabase = createSupabaseServerClient();
    const serviceSupabase = createSupabaseServiceRoleClient();
    const body = await request.json().catch(() => ({}));

    const result = await handleSovereignAdminRequest({
      authSupabase,
      serviceSupabase,
      body
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
