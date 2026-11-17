/**
 * Server-Side Session & Role Guard
 * NEVER trusts any actor, role, or branch ID from request body or headers.
 * Always verifies the authenticated user via Supabase Auth (supabase.auth.getUser())
 * and fetches their authoritative profile from public.user_profiles.
 */
export async function requireAuthenticatedProfile(supabaseClient, allowedRoles = []) {
  if (!supabaseClient || !supabaseClient.auth) {
    return {
      ok: false,
      status: 500,
      code: 'SUPABASE_AUTH_CLIENT_MISSING',
      profile: null
    };
  }

  const { data: authData, error: authErr } = await supabaseClient.auth.getUser();
  if (authErr || !authData || !authData.user || !authData.user.id) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED_SESSION',
      message: 'Valid Supabase authentication session is required.',
      profile: null
    };
  }

  const userId = authData.user.id;
  const { data: profile, error: profileErr } = await supabaseClient
    .from('user_profiles')
    .select('id, email, full_name, role, assigned_branch_id, is_active, permissions')
    .eq('id', userId)
    .single();

  if (profileErr || !profile) {
    return {
      ok: false,
      status: 403,
      code: 'PROFILE_NOT_FOUND',
      message: 'No active staff/owner/admin profile is linked to this authenticated user.',
      profile: null
    };
  }

  if (!profile.is_active) {
    return {
      ok: false,
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
      message: 'This account has been suspended by an administrator.',
      profile: null
    };
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    return {
      ok: false,
      status: 403,
      code: allowedRoles.length === 1 && allowedRoles[0] === 'super_admin'
        ? 'SOVEREIGN_PRIVILEGE_REQUIRED'
        : 'INSUFFICIENT_ROLE_PRIVILEGES',
      message: `Role '${profile.role}' is not authorized for this resource.`,
      profile
    };
  }

  return {
    ok: true,
    status: 200,
    code: 'AUTHORIZED',
    profile
  };
}
