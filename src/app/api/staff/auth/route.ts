import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'INVALID_ORIGIN', message_ar: 'تعذر التحقق من مصدر الطلب.' }, { status: 403 });
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 4096) {
      return NextResponse.json({ error: 'REQUEST_TOO_LARGE' }, { status: 413 });
    }

    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 128) {
      return NextResponse.json({ error: 'INVALID_CREDENTIALS', message_ar: 'أدخل البريد الوظيفي وكلمة المرور بشكل صحيح.' }, { status: 400 });
    }

    // Staff/admin sessions use the default Supabase cookie namespace.
    // Customer sessions are stored separately in bh-customer-auth.
    const auth = createSupabaseServerClient();
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json({ error: 'INVALID_CREDENTIALS', message_ar: 'البريد الوظيفي أو كلمة المرور غير صحيحة.' }, { status: 401 });
    }

    const service = createSupabaseServiceRoleClient();
    const { data: profile, error: profileError } = await service
      .from('user_profiles')
      .select('id, role, is_active, assigned_branch_id')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.is_active) {
      await auth.auth.signOut();
      return NextResponse.json({ error: 'STAFF_PROFILE_NOT_ACTIVE', message_ar: 'هذا الحساب غير مفعل أو لا يملك صلاحيات الموظفين والإدارة.' }, { status: 403 });
    }

    const redirectTo = profile.role === 'super_admin'
      ? '/bh-sovereign-vault'
      : profile.role === 'owner'
        ? '/owner-studio'
        : '/staff/orders';

    return NextResponse.json(
      { ok: true, role: profile.role, redirect_to: redirectTo },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    console.error('Staff login failed:', error?.message || error);
    return NextResponse.json({ error: 'STAFF_LOGIN_FAILED', message_ar: 'تعذر تسجيل الدخول الآن. حاول مرة أخرى.' }, { status: 503 });
  }
}
