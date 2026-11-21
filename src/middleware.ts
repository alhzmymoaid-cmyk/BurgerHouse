import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Security headers on every response
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const isStaffRoute = pathname.startsWith('/staff');
  const isOwnerRoute = pathname.startsWith('/owner-studio') || pathname.startsWith('/api/admin/owner') || pathname.startsWith('/api/media/upload');
  const isSovereignRoute = pathname.startsWith('/bh-sovereign-vault') || pathname.startsWith('/api/admin/sovereign');
  const isOrderStatusMutation = pathname.startsWith('/api/orders/') && pathname.endsWith('/status');

  if (isStaffRoute || isOwnerRoute || isSovereignRoute || isOrderStatusMutation) {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'UNAUTHENTICATED_SESSION', message: 'Authentication session required.' },
          { status: 401 }
        );
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/auth/login';
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }

    const { data: profile, error: profErr } = await supabase
      .from('user_profiles')
      .select('role, is_active, assigned_branch_id, permissions')
      .eq('id', user.id)
      .single();

    if (profErr || !profile || !profile.is_active) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'PROFILE_INACTIVE_OR_MISSING' },
          { status: 403 }
        );
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/auth/login';
      loginUrl.searchParams.set('error', 'unauthorized_profile');
      return NextResponse.redirect(loginUrl);
    }

    // Strict Role Gate for Sovereign Super Admin Vault
    if (isSovereignRoute && profile.role !== 'super_admin') {
      return NextResponse.json(
        {
          error: 'SOVEREIGN_PRIVILEGE_REQUIRED',
          message: 'Restaurant owners and staff are strictly forbidden from accessing Sovereign Super Admin routes.'
        },
        { status: 403 }
      );
    }

    // Owner studio remains owner-only; catalog image uploads may use an explicit catalog permission.
    const hasCatalogPermission = profile.role === 'branch_manager'
      && Array.isArray((profile as any).permissions)
      && (profile as any).permissions.includes('catalog_manage');
    const isCatalogUpload = pathname.startsWith('/api/media/upload');
    if (isOwnerRoute && !['super_admin', 'owner'].includes(profile.role) && !(isCatalogUpload && hasCatalogPermission)) {
      return NextResponse.json(
        {
          error: 'OWNER_PRIVILEGE_REQUIRED',
          message: 'تحتاج إلى صلاحية إدارة المتجر للوصول إلى هذه العملية.'
        },
        { status: 403 }
      );
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images/).*)'],
};
