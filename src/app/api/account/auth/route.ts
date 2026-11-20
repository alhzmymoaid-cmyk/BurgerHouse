import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { createSupabaseCustomerServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

function normalizeSaudiPhone(value: unknown): string {
  const arabicDigits = String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  const digits = arabicDigits.replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return '+966' + digits.slice(1);
  if (/^5\d{8}$/.test(digits)) return '+966' + digits;
  if (/^9665\d{8}$/.test(digits)) return '+' + digits;
  if (/^009665\d{8}$/.test(digits)) return '+' + digits.slice(2);
  return '';
}

function isStrictLocalSaudiPhone(value: unknown): boolean {
  const localized = String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  return /^05\\d{8}$/.test(localized.replace(/\\D/g, ''));
}

function hmac(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    if (origin) {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.origin !== request.nextUrl.origin) {
        return reply({ error: 'INVALID_ORIGIN', message_ar: 'تعذر التحقق من مصدر الطلب.' }, 403);
      }
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 4096) {
      return reply({ error: 'REQUEST_TOO_LARGE', message_ar: 'الطلب أكبر من المسموح.' }, 413);
    }

    const body = await request.json();
    const mode = body?.mode === 'signup' ? 'signup' : body?.mode === 'login' ? 'login' : '';
    const phone = normalizeSaudiPhone(body?.phone);
    if (mode === 'signup' && !isStrictLocalSaudiPhone(body?.phone)) {
      return reply({ error: 'INVALID_PHONE', message_ar: 'عند إنشاء الحساب، أدخل رقم جوال يبدأ بـ 05 ويتكون من 10 أرقام.' }, 400);
    }
    const password = typeof body?.password === 'string' ? body.password : '';
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';

    if (!mode) return reply({ error: 'INVALID_MODE', message_ar: 'اختر تسجيل الدخول أو إنشاء حساب.' }, 400);
    if (!phone) return reply({ error: 'INVALID_PHONE', message_ar: 'أدخل رقم جوال سعودي صحيحًا مثل 05XXXXXXXX.' }, 400);
    if (password.length < 8 || password.length > 72) {
      return reply({ error: 'INVALID_PASSWORD', message_ar: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' }, 400);
    }
    if (mode === 'signup' && (fullName.length < 2 || fullName.length > 100)) {
      return reply({ error: 'INVALID_NAME', message_ar: 'اكتب اسمك بشكل صحيح.' }, 400);
    }

    const secret = process.env.ORDER_HMAC_SECRET;
    if (!secret || secret.length < 32) {
      console.error('Customer auth is missing a valid ORDER_HMAC_SECRET.');
      return reply({ error: 'AUTH_CONFIGURATION_ERROR', message_ar: 'خدمة الحسابات غير جاهزة حاليًا. حاول لاحقًا.' }, 503);
    }

    const phoneDigits = phone.replace(/\D/g, '');
    const alias = 'bh_' + hmac(secret, 'customer-login:' + phoneDigits) + '@login.burgerhouse.invalid';
    const ip = request.headers.get('x-real-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown';
    const service = createSupabaseServiceRoleClient();

    const ipKey = hmac(secret, 'customer-auth:ip:' + ip + ':' + mode);
    const phoneKey = hmac(secret, 'customer-auth:phone:' + phoneDigits + ':' + mode);
    const maxIpAttempts = mode === 'signup' ? 8 : 20;
    const maxPhoneAttempts = mode === 'signup' ? 3 : 8;
    const windowSeconds = mode === 'signup' ? 3600 : 900;

    const [ipLimit, phoneLimit] = await Promise.all([
      service.rpc('consume_customer_auth_rate_limit', {
        p_key: ipKey,
        p_max_attempts: maxIpAttempts,
        p_window_seconds: windowSeconds,
      }),
      service.rpc('consume_customer_auth_rate_limit', {
        p_key: phoneKey,
        p_max_attempts: maxPhoneAttempts,
        p_window_seconds: windowSeconds,
      }),
    ]);

    if (ipLimit.error || phoneLimit.error) {
      console.error('Customer auth rate-limit check failed:', ipLimit.error || phoneLimit.error);
      return reply({ error: 'AUTH_TEMPORARILY_UNAVAILABLE', message_ar: 'تعذر التحقق من المحاولة الآن. حاول بعد قليل.' }, 503);
    }
    if (ipLimit.data !== true || phoneLimit.data !== true) {
      return reply({ error: 'TOO_MANY_ATTEMPTS', message_ar: 'محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مجددًا.' }, 429);
    }

    if (mode === 'signup') {
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email: alias,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone, customer_account: true },
        app_metadata: { customer_account: true, customer_phone: phone },
      });

      if (createError || !created.user) {
        const message = createError?.message || '';
        const code = String((createError as any)?.code || '');
        const status = Number((createError as any)?.status || 0);
        console.error('Customer Auth createUser failed:', { code, status, message });
        const phoneConflict = /customer_profiles_phone_key|duplicate key|unique constraint|database error creating new user/i.test(message) || code === '23505';
        const duplicate = /already|exists|registered|duplicate|unique constraint/i.test(message) || code === 'email_exists';
        const rateLimited = status === 429 || /rate.?limit|too many requests/i.test(message);
        const weakPassword = /weak password|password should|password is too short/i.test(message);
        return reply({
          error: phoneConflict || duplicate ? 'ACCOUNT_ALREADY_EXISTS' : rateLimited ? 'AUTH_RATE_LIMITED' : weakPassword ? 'WEAK_PASSWORD' : 'ACCOUNT_CREATE_FAILED',
          message_ar: phoneConflict || duplicate
            ? 'رقم الجوال مرتبط بحساب موجود. اختر «لدي حساب» وسجّل الدخول، ولا تنشئ حسابًا جديدًا.'
            : rateLimited
              ? 'وصلت إلى عدد المحاولات المسموح. انتظر قليلًا ثم حاول مجددًا.'
              : weakPassword
                ? 'كلمة المرور ضعيفة. اختر كلمة مرور أقوى من 8 أحرف.'
                : 'تعذر إنشاء الحساب الآن بسبب مشكلة في خدمة الحسابات. حاول لاحقًا أو تواصل مع الدعم.',
        }, phoneConflict || duplicate ? 409 : rateLimited ? 429 : weakPassword ? 400 : 503);
      }

      // The auth.users trigger creates the profile. Update by user ID only so a
      // unique phone value is never reassigned to a different account.
      const { data: existingProfile, error: profileLookupError } = await service
        .from('customer_profiles')
        .select('id')
        .eq('id', created.user.id)
        .maybeSingle();

      let profileError = profileLookupError;
      if (!profileError && existingProfile) {
        const { error } = await service
          .from('customer_profiles')
          .update({ full_name: fullName, updated_at: new Date().toISOString() })
          .eq('id', created.user.id);
        profileError = error;
      } else if (!profileError) {
        const { error } = await service
          .from('customer_profiles')
          .insert({ id: created.user.id, full_name: fullName, phone });
        profileError = error;
      }

      if (profileError) {
        console.error('Customer profile persistence failed:', {
          code: profileError.code,
          message: profileError.message,
        });
        await service.auth.admin.deleteUser(created.user.id);
        const phoneConflict = profileError.code === '23505' || /customer_profiles_phone_key|duplicate key/i.test(profileError.message || '');
        return reply({
          error: phoneConflict ? 'PHONE_ALREADY_LINKED' : 'PROFILE_CREATE_FAILED',
          message_ar: phoneConflict
            ? 'رقم الجوال مرتبط بحساب آخر. سجّل الدخول بالحساب السابق أو تواصل مع الدعم.'
            : 'تعذر تجهيز ملف الحساب. حاول مرة أخرى بعد قليل.',
        }, phoneConflict ? 409 : 503);
      }
    }

    // Older customer accounts may use a verified email as their Auth identifier,
    // while the current UI accepts only a phone number. Resolve that legacy email
    // through the unique server-side customer profile before checking the password.
    let loginEmail = alias;
    let legacyUserId: string | null = null;
    if (mode === 'login') {
      const { data: profile, error: profileError } = await service
        .from('customer_profiles')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

      if (profileError) {
        console.error('Customer profile lookup failed during login:', profileError.message);
        return reply({ error: 'AUTH_TEMPORARILY_UNAVAILABLE', message_ar: 'تعذر التحقق من الحساب الآن. حاول بعد قليل.' }, 503);
      }

      if (profile?.id) {
        const { data: authUser, error: authUserError } = await service.auth.admin.getUserById(profile.id);
        if (authUserError) {
          console.error('Legacy customer Auth lookup failed:', authUserError.message);
          return reply({ error: 'AUTH_TEMPORARILY_UNAVAILABLE', message_ar: 'تعذر التحقق من الحساب الآن. حاول بعد قليل.' }, 503);
        }
        if (authUser.user?.email) {
          loginEmail = authUser.user.email;
          legacyUserId = authUser.user.id;
        }
      }
    }

    // The server-side SSR client writes the authenticated session into secure Supabase cookies.
    const auth = createSupabaseCustomerServerClient();
    const { error: loginError } = await auth.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (loginError) {
      const invalid = /invalid login credentials/i.test(loginError.message || '');
      return reply({
        error: invalid ? 'INVALID_CREDENTIALS' : 'SIGN_IN_FAILED',
        message_ar: invalid
          ? 'رقم الجوال أو كلمة المرور غير صحيحة.'
          : 'تعذر تسجيل الدخول الآن. حاول مرة أخرى.',
      }, invalid ? 401 : 503);
    }

    // Upgrade legacy email-based customer sessions to the current customer claim.
    // This happens only after the account password has been accepted.
    if (legacyUserId) {
      const { data: existingAuthUser } = await service.auth.admin.getUserById(legacyUserId);
      const appMetadata = existingAuthUser.user?.app_metadata || {};
      const { error: metadataError } = await service.auth.admin.updateUserById(legacyUserId, {
        app_metadata: { ...appMetadata, customer_account: true, customer_phone: phone },
      });

      if (metadataError) {
        console.error('Legacy customer metadata upgrade failed:', metadataError.message);
        return reply({ error: 'ACCOUNT_UPGRADE_FAILED', message_ar: 'تم التحقق من كلمة المرور، لكن تعذر تجهيز جلسة الحساب. حاول مرة أخرى.' }, 503);
      }

      const { error: refreshError } = await auth.auth.refreshSession();
      if (refreshError) {
        console.error('Legacy customer session refresh failed:', refreshError.message);
        return reply({ error: 'ACCOUNT_UPGRADE_FAILED', message_ar: 'تم التحقق من الحساب، لكن تعذر تحديث الجلسة. سجّل الدخول مرة أخرى.' }, 503);
      }
    }

    return reply({ ok: true });
  } catch (error: any) {
    console.error('Customer account auth failed:', error?.message || error);
    return reply({ error: 'CUSTOMER_AUTH_ERROR', message_ar: 'حدث خطأ غير متوقع. حاول مرة أخرى.' }, 500);
  }
}
