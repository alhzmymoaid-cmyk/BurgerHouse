import {
  getRequiredEnvSecret,
  hashClientIdentifier,
  validateAndNormalizeSaudiPhone,
  computePayloadDigest,
  createAdaptiveCaptchaChallenge,
  verifyAdaptiveCaptchaSolution,
  generateTrackingToken,
  verifyImageMagicBytes
} from '../domain/core-engine.mjs';
import { requireAuthenticatedProfile } from './auth-guard.mjs';

/**
 * 1. Create Verified Pickup Order Handler (POST /api/orders)
 * - Uses Supabase PostgreSQL Atomic RPC `create_verified_pickup_order`
 * - Uses shared database tables for Idempotency, Rate-Limiting, Blocklist, and Nonce-consumed CAPTCHA
 * - Zero in-memory Map storage!
 */
export async function handleCreateOrderRequest({
  serviceSupabase,
  idempotencyKey,
  clientIp,
  sessionFingerprint,
  payload,
  nowDate = new Date()
}) {
  const orderHmacSecret = getRequiredEnvSecret('ORDER_HMAC_SECRET');
  const captchaSecret = getRequiredEnvSecret('CAPTCHA_SIGNING_SECRET');

  // 1. Honeypot Bot Trap
  if (payload?.website_url_honeypot && String(payload.website_url_honeypot).trim().length > 0) {
    await serviceSupabase.from('security_abuse_logs').insert({
      event_type: 'HONEYPOT_TRIGGERED',
      severity: 'high',
      client_ip_hash: hashClientIdentifier(clientIp, orderHmacSecret),
      session_fingerprint: hashClientIdentifier(sessionFingerprint, orderHmacSecret),
      customer_phone: String(payload?.customer_phone || '').slice(0, 20),
      details: { trap: 'website_url_honeypot' }
    });
    return { status: 403, body: { error: 'BOT_HONEYPOT_DETECTED' } };
  }

  // 2. Validate Idempotency Key Format
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
    return { status: 400, body: { error: 'MISSING_IDEMPOTENCY_KEY' } };
  }

  // 3. Validate Saudi Mobile Format before hitting RPC
  const phoneValidation = validateAndNormalizeSaudiPhone(payload?.customer_phone);
  if (!phoneValidation.valid) {
    await serviceSupabase.from('security_abuse_logs').insert({
      event_type: 'INVALID_PHONE_ATTEMPT',
      severity: 'low',
      client_ip_hash: hashClientIdentifier(clientIp, orderHmacSecret),
      session_fingerprint: hashClientIdentifier(sessionFingerprint, orderHmacSecret),
      customer_phone: String(payload?.customer_phone || '').slice(0, 20),
      details: { reason: phoneValidation.reason }
    });
    return { status: 400, body: { error: phoneValidation.reason } };
  }

  const normalizedPhone = phoneValidation.normalized;
  const ipHash = hashClientIdentifier(clientIp, orderHmacSecret);
  const sessionHash = hashClientIdentifier(sessionFingerprint, orderHmacSecret);
  const payloadHash = computePayloadDigest({
    ...payload,
    customer_phone: normalizedPhone
  });

  // 4. Evaluate Risk Score & Shared Single-Use CAPTCHA Nonce Verification
  const totalQty = Array.isArray(payload?.items)
    ? payload.items.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0)
    : 0;
  let riskScore = 0;
  if (totalQty >= 5) riskScore += 45;
  if (payload?.require_captcha_verification) riskScore += 50;

  if (riskScore >= 40) {
    const captchaResult = verifyAdaptiveCaptchaSolution(
      payload?.captcha_token,
      payload?.captcha_answer,
      captchaSecret
    );
    if (!captchaResult.verified) {
      return {
        status: 428,
        body: {
          error: 'CAPTCHA_REQUIRED',
          reason: captchaResult.reason,
          risk_score: riskScore,
          challenge: createAdaptiveCaptchaChallenge(captchaSecret)
        }
      };
    }

    // Consume CAPTCHA nonce atomically in PostgreSQL so it cannot be replayed on another serverless instance
    const { data: nonceConsumed, error: nonceErr } = await serviceSupabase.rpc(
      'consume_captcha_nonce',
      {
        p_nonce: captchaResult.nonce,
        p_client_ip_hash: ipHash,
        p_ttl_seconds: 600
      }
    );
    if (nonceErr || !nonceConsumed) {
      return {
        status: 428,
        body: {
          error: 'CAPTCHA_NONCE_REPLAYED_OR_INVALID',
          challenge: createAdaptiveCaptchaChallenge(captchaSecret)
        }
      };
    }
  }

  // 5. Execute Atomic PostgreSQL Transaction RPC `create_verified_pickup_order`
  const preGeneratedToken = generateTrackingToken(
    idempotencyKey,
    normalizedPhone,
    orderHmacSecret
  );

  const { data: rpcOrder, error: rpcErr } = await serviceSupabase.rpc(
    'create_verified_pickup_order',
    {
      p_idempotency_key: idempotencyKey.trim(),
      p_payload_hash: payloadHash,
      p_branch_id: payload.branch_id,
      p_customer_name: payload.customer_name,
      p_customer_phone: normalizedPhone,
      p_customer_notes: payload.customer_notes || '',
      p_payment_method_id: payload.payment_method_id,
      p_items: payload.items,
      p_client_ip_hash: ipHash,
      p_session_fingerprint: sessionHash,
      p_risk_score: riskScore,
      p_tracking_token: preGeneratedToken,
      p_client_claimed_total: payload.coupon_code ? null : (payload.client_claimed_total ?? null),
      p_check_timestamp: nowDate.toISOString(),
      p_coupon_code: typeof payload.coupon_code === 'string' ? payload.coupon_code.trim().toUpperCase() : null
    }
  );

  if (rpcErr) {
    const msg = rpcErr.message || 'ORDER_CREATION_FAILED';
    if (msg.includes('IDEMPOTENCY_PAYLOAD_MISMATCH')) {
      return { status: 409, body: { error: 'IDEMPOTENCY_PAYLOAD_MISMATCH', message: msg } };
    }
    if (msg.includes('ENTITY_BLOCKED')) {
      return { status: 403, body: { error: 'ENTITY_BLOCKED', message: msg } };
    }
    if (msg.includes('RATE_LIMIT_EXCEEDED')) {
      return { status: 429, body: { error: 'RATE_LIMIT_EXCEEDED', message: msg } };
    }
    if (msg.includes('COUPON_INVALID_OR_EXPIRED')) {
      return { status: 422, body: { error: 'COUPON_INVALID_OR_EXPIRED', message_ar: 'رمز الخصم غير صالح أو منتهي أو استُنفدت مرات استخدامه.' } };
    }
    if (msg.includes('COUPON_MINIMUM_ORDER_NOT_MET')) {
      return { status: 422, body: { error: 'COUPON_MINIMUM_ORDER_NOT_MET', message_ar: 'قيمة الطلب أقل من الحد الأدنى لهذا الخصم.' } };
    }
    if (msg.includes('COUPON_INVALID_DISCOUNT')) {
      return { status: 422, body: { error: 'COUPON_INVALID_DISCOUNT', message_ar: 'إعدادات الخصم غير صالحة. تواصل مع المطعم.' } };
    }
    if (
      msg.includes('BRANCH_NOT_ACCEPTING_ORDERS') ||
      msg.includes('BRANCH_CLOSED_TODAY') ||
      msg.includes('OUTSIDE_OPERATING_HOURS') ||
      msg.includes('PAYMENT_METHOD_DISABLED_OR_INVALID') ||
      msg.includes('PRICE_TAMPERING_REJECTED') ||
      msg.includes('PRODUCT_UNAVAILABLE_AT_BRANCH')
    ) {
      return { status: 422, body: { error: msg.split(':')[0], message: msg } };
    }
    return { status: 400, body: { error: 'ORDER_VALIDATION_ERROR', message: msg } };
  }

  return {
    status: rpcOrder?.idempotent_replay ? 200 : 201,
    body: rpcOrder
  };
}

/**
 * 2. Server-Authenticated Order Status Transition Handler (PATCH /api/orders/[code]/status)
 * - NEVER trusts actor or order from request body!
 * - Authenticates caller via Supabase Auth session -> user_profiles -> calls `transition_order_status` RPC.
 */
export async function handleTransitionOrderStatusRequest({
  authSupabase,
  serviceSupabase,
  orderCode,
  body
}) {
  // Detect and log any spoofing attempt if client tried to send `actor` or `order` in body
  if (body && (body.actor || body.order || body.actor_role)) {
    await serviceSupabase.from('security_abuse_logs').insert({
      event_type: 'ACTOR_OR_ORDER_SPOOFING_ATTEMPT_IGNORED',
      severity: 'high',
      details: {
        order_code: orderCode,
        spoofed_actor: body.actor || body.actor_role || null
      }
    });
  }

  const authCheck = await requireAuthenticatedProfile(authSupabase, [
    'super_admin',
    'owner',
    'branch_manager',
    'cashier',
    'kitchen_staff'
  ]);
  if (!authCheck.ok) {
    return {
      status: authCheck.status,
      body: { error: authCheck.code, message: authCheck.message }
    };
  }

  const actorProfile = authCheck.profile;
  const targetStatus = body?.target_status;
  if (!targetStatus) {
    return { status: 400, body: { error: 'MISSING_TARGET_STATUS' } };
  }

  // Call transition_order_status on authSupabase so PostgreSQL derives identity strictly from auth.uid()!
  // No client-supplied actor UID parameter is ever passed!
  const { data: updatedOrder, error: rpcErr } = await authSupabase.rpc(
    'transition_order_status',
    {
      p_order_code: orderCode,
      p_target_status: targetStatus,
      p_confirmed: Boolean(body?.confirmed),
      p_reason_note: String(body?.reason_note || '')
    }
  );

  if (rpcErr) {
    const msg = rpcErr.message || 'STATUS_TRANSITION_FAILED';
    if (msg.includes('ORDER_NOT_FOUND')) {
      return { status: 404, body: { error: 'ORDER_NOT_FOUND' } };
    }
    if (msg.includes('CROSS_BRANCH_ACCESS_DENIED') || msg.includes('ROLE_NOT_AUTHORIZED_FOR_STATUS')) {
      return { status: 403, body: { error: msg.split(':')[0], message: msg } };
    }
    if (msg.includes('CONFIRMATION_REQUIRED_FOR_SENSITIVE_ACTION')) {
      return { status: 400, body: { error: 'CONFIRMATION_REQUIRED_FOR_SENSITIVE_ACTION' } };
    }
    if (msg.includes('ILLOGICAL_STATUS_TRANSITION')) {
      return { status: 422, body: { error: 'ILLOGICAL_STATUS_TRANSITION', message: msg } };
    }
    return { status: 400, body: { error: msg } };
  }

  return { status: 200, body: updatedOrder };
}

/**
 * 3. Privacy-Safe Order Tracking Handler (GET / POST /api/orders/track)
 * - Requires BOTH `order_code` AND `tracking_token`
 * - Never exposes raw customer phone, full name, or internal staff IDs!
 */
export async function handleTrackOrderRequest({
  serviceSupabase,
  orderCode,
  trackingToken
}) {
  if (!orderCode || !trackingToken || String(trackingToken).trim().length < 24 || !String(trackingToken).trim().startsWith('trk_')) {
    return {
      status: 401,
      body: {
        error: 'MISSING_TRACKING_CREDENTIALS',
        message_ar: 'يلزم توفير رقم الطلب مع رمز التتبع الأمني الخاص بالطلب.'
      }
    };
  }

  const { data, error } = await serviceSupabase.rpc('get_order_tracking_status', {
    p_order_code: String(orderCode).trim().toUpperCase(),
    p_tracking_token: String(trackingToken).trim()
  });

  if (error || !data) {
    return {
      status: 404,
      body: {
        error: 'ORDER_TRACKING_NOT_FOUND_OR_UNAUTHORIZED',
        message_ar: 'تعذر العثور على الطلب أو أن رمز التتبع غير مطابق.'
      }
    };
  }

  return { status: 200, body: data };
}

/**
 * 4. Sovereign Super Admin Handler (POST / GET /api/admin/sovereign)
 * - Strictly verifies session via `requireAuthenticatedProfile(authSupabase, ['super_admin'])`
 * - Completely rejects `owner`, `branch_manager`, or spoofed body.actor with 403 Forbidden!
 */
export async function handleSovereignAdminRequest({
  authSupabase,
  serviceSupabase,
  body
}) {
  if (body && body.actor) {
    await serviceSupabase.from('security_abuse_logs').insert({
      event_type: 'SOVEREIGN_ACTOR_BODY_SPOOF_ATTEMPT',
      severity: 'critical',
      details: { spoofed_actor: body.actor }
    });
  }

  const authCheck = await requireAuthenticatedProfile(authSupabase, ['super_admin']);
  if (!authCheck.ok) {
    return {
      status: authCheck.status,
      body: {
        error: authCheck.code,
        message: 'Access denied: Only an authenticated super_admin session can access Sovereign operations.'
      }
    };
  }

  const superAdmin = authCheck.profile;
  const action = body?.action;

  if (action === 'SET_SYSTEM_AVAILABILITY') {
    const { data, error } = await serviceSupabase
      .from('system_settings')
      .update({
        site_online: Boolean(body.site_online),
        maintenance_mode: Boolean(body.maintenance_mode),
        ...(typeof body.maintenance_message_ar === 'string' ? { maintenance_message_ar: body.maintenance_message_ar.trim().slice(0, 500) } : {}),
        ...(typeof body.maintenance_message_en === 'string' ? { maintenance_message_en: body.maintenance_message_en.trim().slice(0, 500) } : {}),
        updated_by: superAdmin.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1)
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };

    await serviceSupabase.from('audit_logs').insert({
      actor_id: superAdmin.id,
      actor_name: superAdmin.full_name,
      actor_role: superAdmin.role,
      action: 'SET_SYSTEM_AVAILABILITY',
      target_type: 'system_settings',
      target_id: '1',
      metadata: { site_online: data.site_online, maintenance_mode: data.maintenance_mode }
    });

    return { status: 200, body: { ok: true, settings: data } };
  }

  if (action === 'MANAGE_USER_PROFILE_STATUS') {
    const { target_user_id, is_active, new_role, assigned_branch_id, permissions } = body;
    const targetId = String(target_user_id || '').trim();
    const validRoles = ['owner', 'branch_manager', 'cashier', 'kitchen_staff', 'super_admin'];
    if (!targetId) return { status: 400, body: { error: 'TARGET_USER_ID_REQUIRED' } };
    if (new_role && !validRoles.includes(new_role)) return { status: 400, body: { error: 'INVALID_STAFF_ROLE' } };

    const { data: targetRows, error: targetLookupError } = await serviceSupabase
      .from('user_profiles')
      .select('id,role,assigned_branch_id')
      .eq('id', targetId);
    if (targetLookupError) return { status: 400, body: { error: targetLookupError.message } };
    const target = Array.isArray(targetRows) ? targetRows[0] : null;
    if (!target) return { status: 404, body: { error: 'STAFF_PROFILE_NOT_FOUND' } };

    if (targetId === superAdmin.id && (
      is_active === false || (new_role && new_role !== 'super_admin')
    )) {
      return { status: 409, body: { error: 'SUPER_ADMIN_SELF_LOCKOUT_BLOCKED', message_ar: 'لا يمكن تعطيل حساب مدير النظام الحالي أو خفض صلاحيته من الجلسة نفسها.' } };
    }

    const nextRole = new_role || target.role;
    let nextBranchId = assigned_branch_id !== undefined ? (assigned_branch_id || null) : target.assigned_branch_id;
    if (new_role && ['owner', 'super_admin'].includes(new_role) && assigned_branch_id === undefined) {
      nextBranchId = null;
    }
    if (['branch_manager', 'cashier', 'kitchen_staff'].includes(nextRole) && !nextBranchId) {
      return { status: 400, body: { error: 'BRANCH_REQUIRED_FOR_STAFF_ROLE', message_ar: 'يجب تعيين فرع لهذا الحساب.' } };
    }
    if (permissions !== undefined && (!Array.isArray(permissions) || permissions.some((permission) => permission !== 'catalog_manage'))) {
      return { status: 400, body: { error: 'INVALID_STAFF_PERMISSIONS' } };
    }
    if (permissions !== undefined && nextRole !== 'branch_manager' && permissions.length) {
      return { status: 400, body: { error: 'PERMISSIONS_REQUIRE_BRANCH_MANAGER_ROLE' } };
    }
    if (nextBranchId) {
      const { data: branchRows, error: branchLookupError } = await serviceSupabase
        .from('branches').select('id').eq('id', nextBranchId);
      if (branchLookupError) return { status: 400, body: { error: branchLookupError.message } };
      if (!Array.isArray(branchRows) || !branchRows.length) return { status: 400, body: { error: 'BRANCH_NOT_FOUND' } };
    }

    const updatePayload = { updated_at: new Date().toISOString() };
    if (typeof is_active === 'boolean') updatePayload.is_active = is_active;
    if (new_role) updatePayload.role = new_role;
    if (assigned_branch_id !== undefined || (new_role && ['owner', 'super_admin'].includes(new_role))) {
      updatePayload.assigned_branch_id = nextBranchId;
    }
    if (permissions !== undefined) {
      updatePayload.permissions = nextRole === 'branch_manager' && permissions.includes('catalog_manage') ? ['catalog_manage'] : [];
    } else if (new_role) {
      updatePayload.permissions = [];
    }

    const { data, error } = await serviceSupabase
      .from('user_profiles')
      .update(updatePayload)
      .eq('id', targetId)
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };

    await serviceSupabase.from('audit_logs').insert({
      actor_id: superAdmin.id,
      actor_name: superAdmin.full_name,
      actor_role: superAdmin.role,
      action: 'MANAGE_USER_PROFILE_STATUS',
      target_type: 'user_profile',
      target_id: targetId,
      metadata: updatePayload
    });

    return { status: 200, body: { ok: true, profile: data } };
  }

  if (action === 'BLOCK_ENTITY') {
    const { entity_type, entity_value, reason } = body;
    const { data, error } = await serviceSupabase
      .from('blocked_entities')
      .upsert(
        {
          entity_type,
          entity_value,
          reason: reason || 'Blocked by Sovereign Admin',
          blocked_by: superAdmin.email,
          is_active: true
        },
        { onConflict: 'entity_type,entity_value' }
      )
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };

    await serviceSupabase.from('audit_logs').insert({
      actor_id: superAdmin.id,
      actor_name: superAdmin.full_name,
      actor_role: superAdmin.role,
      action: 'BLOCK_ENTITY',
      target_type: entity_type,
      target_id: entity_value,
      metadata: { reason }
    });

    return { status: 200, body: { ok: true, blocked: data } };
  }

  if (action === 'UNBLOCK_ENTITY') {
    const { entity_type, entity_value } = body;
    const { data, error } = await serviceSupabase
      .from('blocked_entities')
      .update({ is_active: false })
      .eq('entity_type', entity_type)
      .eq('entity_value', entity_value)
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };
    await serviceSupabase.from('audit_logs').insert({
      actor_id: superAdmin.id,
      actor_name: superAdmin.full_name,
      actor_role: superAdmin.role,
      action: 'UNBLOCK_ENTITY',
      target_type: entity_type,
      target_id: entity_value,
      metadata: { is_active: false }
    });
    return { status: 200, body: { ok: true, blocked: data } };
  }

  if (action === 'EXPORT_SYSTEM_SNAPSHOT') {
    const [settingsRes, branchesRes, productsRes, ordersRes, profilesRes, auditRes] = await Promise.all([
      serviceSupabase.from('system_settings').select('*'),
      serviceSupabase.from('branches').select('*'),
      serviceSupabase.from('products').select('*'),
      serviceSupabase.from('orders').select('*').limit(200),
      serviceSupabase.from('user_profiles').select('*'),
      serviceSupabase.from('audit_logs').select('*').limit(200)
    ]);

    return {
      status: 200,
      body: {
        ok: true,
        exported_at: new Date().toISOString(),
        exported_by: superAdmin.email,
        snapshot: {
          system_settings: settingsRes.data || [],
          branches: branchesRes.data || [],
          products: productsRes.data || [],
          orders: ordersRes.data || [],
          user_profiles: profilesRes.data || [],
          audit_logs: auditRes.data || []
        }
      }
    };
  }

  return { status: 400, body: { error: 'UNKNOWN_SOVEREIGN_ACTION' } };
}

/**
 * 5. Restaurant Owner Operations Handler (POST /api/admin/owner)
 * - Verifies session via `requireAuthenticatedProfile(authSupabase, ['super_admin', 'owner'])`
 * - Enforces gateway check when toggling payment methods (cannot enable Apple Pay without live gateway!)
 */
export async function handleOwnerAdminRequest({
  authSupabase,
  serviceSupabase,
  body
}) {
  const authCheck = await requireAuthenticatedProfile(authSupabase, ['super_admin', 'owner', 'branch_manager']);
  if (!authCheck.ok) {
    return {
      status: authCheck.status,
      body: { error: authCheck.code, message: authCheck.message }
    };
  }

  const actor = authCheck.profile;
  const action = body?.action;
  const catalogActions = new Set(['UPSERT_PRODUCT','DELETE_PRODUCT','DEACTIVATE_PRODUCT','UPSERT_CATEGORY','DELETE_CATEGORY','DEACTIVATE_CATEGORY','UPSERT_ADDON','DELETE_ADDON','DEACTIVATE_ADDON']);
  if (actor.role === 'branch_manager') {
    return {
      status: 403,
      body: {
        error: 'BRANCH_CATALOG_SCOPE_NOT_IMPLEMENTED',
        message_ar: 'لا يمكن تعديل بيانات المنيو العامة من حساب مدير الفرع؛ لأنها مشتركة بين الفروع. استخدم أدوات توفر المنيو الخاصة بفرعك حتى تتوفر إدارة مستقلة لمنتجات كل فرع.'
      }
    };
  }
  if (actor.role === 'branch_manager' && !catalogActions.has(action)) {
    return { status: 403, body: { error: 'CATALOG_ACTION_FORBIDDEN', message_ar: 'هذه العملية خارج صلاحية إدارة المنيو.' } };
  }

  if (action === 'TOGGLE_PAYMENT_METHOD') {
    const { payment_method_id, is_enabled } = body;
    const { data: pm, error: findErr } = await serviceSupabase
      .from('payment_methods')
      .select('*')
      .eq('id', payment_method_id)
      .single();

    if (findErr || !pm) {
      return { status: 404, body: { error: 'PAYMENT_METHOD_NOT_FOUND' } };
    }

    // Finding #10 Guard: Block enabling online payment method if gateway is not configured
    if (is_enabled && pm.requires_gateway && !pm.gateway_configured) {
      return {
        status: 422,
        body: {
          error: 'PAYMENT_GATEWAY_NOT_CONFIGURED',
          message_ar: 'لا يمكن تفعيل وسيلة دفع إلكتروني (مثل Apple Pay أو البطاقات الائتمانية) قبل ربط وتوثيق مفاتيح بوابة الدفع الفعلية.'
        }
      };
    }

    const { data: updated, error: updErr } = await serviceSupabase
      .from('payment_methods')
      .update({ is_enabled: Boolean(is_enabled) })
      .eq('id', payment_method_id)
      .select('*')
      .single();

    if (updErr) return { status: 400, body: { error: updErr.message } };

    await serviceSupabase.from('audit_logs').insert({
      actor_id: actor.id,
      actor_name: actor.full_name,
      actor_role: actor.role,
      action: 'TOGGLE_PAYMENT_METHOD',
      target_type: 'payment_method',
      target_id: payment_method_id,
      metadata: { is_enabled: Boolean(is_enabled) }
    });

    return { status: 200, body: { ok: true, payment_method: updated } };
  }

  if (action === 'UPSERT_BRANCH') {
    const branchData = body.branch;
    const { data, error } = await serviceSupabase
      .from('branches')
      .upsert(branchData, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };

    await serviceSupabase.from('audit_logs').insert({
      actor_id: actor.id,
      actor_name: actor.full_name,
      actor_role: actor.role,
      action: 'UPSERT_BRANCH',
      target_type: 'branch',
      target_id: data.id,
      metadata: { is_accepting_orders: data.is_accepting_orders }
    });

    return { status: 200, body: { ok: true, branch: data } };
  }

  if (action === 'UPSERT_PRODUCT') {
    const productData = { ...(body.product || {}) };
    const sizes = Array.isArray(productData.sizes) ? productData.sizes : null;
    delete productData.sizes;

    let sizeRows = null;
    if (sizes !== null) {
      sizeRows = sizes.map((size, index) => ({
        id: String(size.id || '').trim(),
        product_id: String(productData.id || ''),
        name_ar: String(size.name_ar || '').trim(),
        name_en: String(size.name_en || '').trim(),
        price_delta: Number(size.price_delta ?? 0),
        is_default: Boolean(size.is_default),
        sort_order: Number.isFinite(Number(size.sort_order)) ? Number(size.sort_order) : index
      }));
      if (sizeRows.some((size) => !size.id || !size.name_ar || !size.name_en || !Number.isFinite(size.price_delta))) {
        return { status: 400, body: { error: 'INVALID_PRODUCT_SIZE_FIELDS' } };
      }
      if (new Set(sizeRows.map((size) => size.id)).size !== sizeRows.length) {
        return { status: 400, body: { error: 'DUPLICATE_PRODUCT_SIZE_IDS' } };
      }
      if (sizeRows.length && !sizeRows.some((size) => size.is_default)) sizeRows[0].is_default = true;
      if (sizeRows.filter((size) => size.is_default).length > 1) {
        return { status: 400, body: { error: 'MULTIPLE_DEFAULT_PRODUCT_SIZES' } };
      }
      const sizeIds = sizeRows.map((size) => size.id);
      if (sizeIds.length) {
        const { data: conflictingSizes, error: conflictLookupError } = await serviceSupabase
          .from('product_sizes').select('id,product_id').in('id', sizeIds);
        if (conflictLookupError) return { status: 400, body: { error: conflictLookupError.message } };
        if ((conflictingSizes || []).some((size) => size.product_id !== productData.id)) {
          return { status: 409, body: { error: 'PRODUCT_SIZE_ID_BELONGS_TO_ANOTHER_PRODUCT' } };
        }
      }
    }

    const { data, error } = await serviceSupabase
      .from('products')
      .upsert({ ...productData, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };

    if (sizeRows !== null) {
      // Upsert desired sizes before removing stale ones. A failed write therefore
      // cannot erase the product's previously working size options.
      if (sizeRows.length) {
        const { error: sizesError } = await serviceSupabase
          .from('product_sizes').upsert(sizeRows.map((size) => ({ ...size, product_id: data.id })), { onConflict: 'id' });
        if (sizesError) return { status: 400, body: { error: sizesError.message } };
      }
      const { data: currentSizes, error: currentSizesError } = await serviceSupabase
        .from('product_sizes').select('id').eq('product_id', data.id);
      if (currentSizesError) return { status: 400, body: { error: currentSizesError.message } };
      const desiredIds = new Set(sizeRows.map((size) => size.id));
      const staleIds = (currentSizes || []).map((size) => size.id).filter((id) => !desiredIds.has(id));
      if (staleIds.length) {
        const { error: staleDeleteError } = await serviceSupabase
          .from('product_sizes').delete().eq('product_id', data.id).in('id', staleIds);
        if (staleDeleteError) return { status: 400, body: { error: staleDeleteError.message } };
      }
    }

    await serviceSupabase.from('audit_logs').insert({
      actor_id: actor.id,
      actor_name: actor.full_name,
      actor_role: actor.role,
      action: 'UPSERT_PRODUCT',
      target_type: 'product',
      target_id: data.id,
      metadata: { base_price: data.base_price, sizes_saved: sizeRows?.length || 0 }
    });

    return { status: 200, body: { ok: true, product: data } };
  }

  if (action === 'DELETE_PRODUCT') {
    const productId = String(body.product_id || '');
    if (!productId) return { status: 400, body: { error: 'PRODUCT_ID_REQUIRED' } };
    const { count, error: usageError } = await serviceSupabase.from('order_items').select('id', { count: 'exact', head: true }).eq('product_id', productId);
    if (usageError) return { status: 400, body: { error: usageError.message } };
    if ((count || 0) > 0) {
      const { error } = await serviceSupabase.from('products').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', productId);
      if (error) return { status: 400, body: { error: error.message } };
      await serviceSupabase.from('audit_logs').insert({ actor_id: actor.id, actor_name: actor.full_name, actor_role: actor.role, action: 'ARCHIVE_PRODUCT', target_type: 'product', target_id: productId, metadata: { reason: 'historical_order_items', usage_count: count } });
      return { status: 200, body: { ok: true, archived: true, message_ar: 'المنتج مرتبط بطلبات سابقة؛ تم أرشفته للحفاظ على سجل الطلبات.' } };
    }
    const { error } = await serviceSupabase.from('products').delete().eq('id', productId);
    if (error) return { status: 400, body: { error: error.message } };
    await serviceSupabase.from('audit_logs').insert({ actor_id: actor.id, actor_name: actor.full_name, actor_role: actor.role, action: 'DELETE_PRODUCT', target_type: 'product', target_id: productId, metadata: {} });
    return { status: 200, body: { ok: true, deleted: true } };
  }

  if (action === 'DEACTIVATE_PRODUCT') {
    const productId = String(body.product_id || '');
    if (!productId) return { status: 400, body: { error: 'PRODUCT_ID_REQUIRED' } };
    const { data, error } = await serviceSupabase
      .from('products')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .select('id,is_active')
      .single();
    if (error) return { status: 400, body: { error: error.message } };
    await serviceSupabase.from('audit_logs').insert({
      actor_id: actor.id, actor_name: actor.full_name, actor_role: actor.role,
      action: 'DEACTIVATE_PRODUCT', target_type: 'product', target_id: productId, metadata: { is_active: false }
    });
    return { status: 200, body: { ok: true, product: data } };
  }

  if (action === 'UPSERT_CATEGORY') {
    const category = body.category || {};
    const categoryId = String(category.id || '');
    if (!categoryId || !String(category.name_ar || '').trim() || !String(category.name_en || '').trim()) {
      return { status: 400, body: { error: 'CATEGORY_FIELDS_REQUIRED' } };
    }
    const { data, error } = await serviceSupabase.from('categories')
      .upsert({
        id: categoryId,
        name_ar: String(category.name_ar).trim(),
        name_en: String(category.name_en).trim(),
        sort_order: Number(category.sort_order || 0),
        is_active: category.is_active !== false
      }, { onConflict: 'id' }).select('*').single();
    if (error) return { status: 400, body: { error: error.message } };
    await serviceSupabase.from('audit_logs').insert({
      actor_id: actor.id, actor_name: actor.full_name, actor_role: actor.role,
      action: 'UPSERT_CATEGORY', target_type: 'category', target_id: data.id, metadata: { is_active: data.is_active }
    });
    return { status: 200, body: { ok: true, category: data } };
  }

  if (action === 'DELETE_CATEGORY') {
    const categoryId = String(body.category_id || '');
    if (!categoryId) return { status: 400, body: { error: 'CATEGORY_ID_REQUIRED' } };
    const { count, error: usageError } = await serviceSupabase.from('products').select('id', { count: 'exact', head: true }).eq('category_id', categoryId);
    if (usageError) return { status: 400, body: { error: usageError.message } };
    if ((count || 0) > 0) {
      const { error } = await serviceSupabase.from('categories').update({ is_active: false }).eq('id', categoryId);
      if (error) return { status: 400, body: { error: error.message } };
      await serviceSupabase.from('products').update({ is_active: false, updated_at: new Date().toISOString() }).eq('category_id', categoryId);
      await serviceSupabase.from('audit_logs').insert({ actor_id: actor.id, actor_name: actor.full_name, actor_role: actor.role, action: 'ARCHIVE_CATEGORY', target_type: 'category', target_id: categoryId, metadata: { products_archived: count } });
      return { status: 200, body: { ok: true, archived: true, message_ar: 'القسم يحتوي منتجات؛ تم أرشفته وإخفاء منتجاته من المنيو.' } };
    }
    const { error } = await serviceSupabase.from('categories').delete().eq('id', categoryId);
    if (error) return { status: 400, body: { error: error.message } };
    await serviceSupabase.from('audit_logs').insert({ actor_id: actor.id, actor_name: actor.full_name, actor_role: actor.role, action: 'DELETE_CATEGORY', target_type: 'category', target_id: categoryId, metadata: {} });
    return { status: 200, body: { ok: true, deleted: true } };
  }

  if (action === 'DEACTIVATE_CATEGORY') {
    const categoryId = String(body.category_id || '');
    if (!categoryId) return { status: 400, body: { error: 'CATEGORY_ID_REQUIRED' } };
    const { data, error } = await serviceSupabase.from('categories')
      .update({ is_active: false }).eq('id', categoryId).select('id,is_active').single();
    if (error) return { status: 400, body: { error: error.message } };
    await serviceSupabase.from('audit_logs').insert({
      actor_id: actor.id, actor_name: actor.full_name, actor_role: actor.role,
      action: 'DEACTIVATE_CATEGORY', target_type: 'category', target_id: categoryId, metadata: { is_active: false }
    });
    return { status: 200, body: { ok: true, category: data } };
  }

  if (action === 'UPSERT_ADDON') {
    const addon = body.addon || {};
    const addonId = String(addon.id || '');
    if (!addonId || !String(addon.name_ar || '').trim() || !String(addon.name_en || '').trim() || !Number.isFinite(Number(addon.price)) || Number(addon.price) < 0) {
      return { status: 400, body: { error: 'ADDON_FIELDS_REQUIRED' } };
    }
    const { data, error } = await serviceSupabase.from('product_addons')
      .upsert({
        id: addonId,
        name_ar: String(addon.name_ar).trim(),
        name_en: String(addon.name_en).trim(),
        price: Number(addon.price),
        max_per_item: Math.max(1, Math.min(10, Number(addon.max_per_item || 3))),
        is_active: addon.is_active !== false
      }, { onConflict: 'id' }).select('*').single();
    if (error) return { status: 400, body: { error: error.message } };
    await serviceSupabase.from('audit_logs').insert({
      actor_id: actor.id, actor_name: actor.full_name, actor_role: actor.role,
      action: 'UPSERT_ADDON', target_type: 'product_addon', target_id: data.id, metadata: { price: data.price }
    });
    return { status: 200, body: { ok: true, addon: data } };
  }

  if (action === 'DELETE_ADDON') {
    const addonId = String(body.addon_id || '');
    if (!addonId) return { status: 400, body: { error: 'ADDON_ID_REQUIRED' } };
    const { data: products, error: productsError } = await serviceSupabase.from('products').select('id,allowed_addon_ids');
    if (productsError) return { status: 400, body: { error: productsError.message } };
    for (const product of products || []) {
      const currentIds = product.allowed_addon_ids || [];
      const nextIds = currentIds.filter((id) => id !== addonId);
      if (nextIds.length !== currentIds.length) {
        const { error } = await serviceSupabase.from('products').update({ allowed_addon_ids: nextIds, updated_at: new Date().toISOString() }).eq('id', product.id);
        if (error) return { status: 400, body: { error: error.message } };
      }
    }
    const { error } = await serviceSupabase.from('product_addons').delete().eq('id', addonId);
    if (error) return { status: 400, body: { error: error.message } };
    await serviceSupabase.from('audit_logs').insert({ actor_id: actor.id, actor_name: actor.full_name, actor_role: actor.role, action: 'DELETE_ADDON', target_type: 'product_addon', target_id: addonId, metadata: {} });
    return { status: 200, body: { ok: true, deleted: true } };
  }

  if (action === 'DEACTIVATE_ADDON') {
    const addonId = String(body.addon_id || '');
    if (!addonId) return { status: 400, body: { error: 'ADDON_ID_REQUIRED' } };
    const { data, error } = await serviceSupabase.from('product_addons')
      .update({ is_active: false }).eq('id', addonId).select('id,is_active').single();
    if (error) return { status: 400, body: { error: error.message } };
    await serviceSupabase.from('audit_logs').insert({
      actor_id: actor.id, actor_name: actor.full_name, actor_role: actor.role,
      action: 'DEACTIVATE_ADDON', target_type: 'product_addon', target_id: addonId, metadata: { is_active: false }
    });
    return { status: 200, body: { ok: true, addon: data } };
  }

  if (action === 'SET_BRANCH_PRICE_OVERRIDE') {
    const { branch_id, product_id, is_available, custom_base_price } = body;
    const { data, error } = await serviceSupabase
      .from('branch_product_overrides')
      .upsert(
        { branch_id, product_id, is_available: Boolean(is_available), custom_base_price },
        { onConflict: 'branch_id,product_id' }
      )
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };
    return { status: 200, body: { ok: true, override: data } };
  }

  if (action === 'MANAGE_STAFF_MEMBER') {
    const staff = body.staff && typeof body.staff === 'object' ? body.staff : null;
    if (!staff || !String(staff.id || '').trim()) {
      return { status: 400, body: { error: 'STAFF_PROFILE_ID_REQUIRED' } };
    }

    let staffPayload = staff;
    if (actor.role === 'owner') {
      const allowedStaffRoles = ['branch_manager', 'cashier', 'kitchen_staff'];
      if (!allowedStaffRoles.includes(staff.role)) {
        return { status: 403, body: { error: 'OWNER_CANNOT_ASSIGN_PRIVILEGED_ROLE' } };
      }

      // Check the existing role as well as the submitted role. Otherwise an owner
      // could demote an existing owner/super_admin by submitting a lower role.
      const { data: existingStaffRows, error: lookupError } = await serviceSupabase
        .from('user_profiles')
        .select('role')
        .eq('id', staff.id);
      if (lookupError) return { status: 400, body: { error: lookupError.message } };
      const existingStaff = Array.isArray(existingStaffRows) ? existingStaffRows[0] : null;
      if (existingStaff && !allowedStaffRoles.includes(existingStaff.role)) {
        return { status: 403, body: { error: 'OWNER_CANNOT_MODIFY_PRIVILEGED_PROFILE' } };
      }

      // Owners may update operational staff fields only; permissions and other
      // privileged profile attributes remain under Super Admin control.
      staffPayload = {
        id: staff.id,
        email: String(staff.email || '').trim().toLowerCase(),
        full_name: String(staff.full_name || '').trim(),
        role: staff.role,
        assigned_branch_id: staff.assigned_branch_id || null,
        is_active: staff.is_active !== false,
        updated_at: new Date().toISOString()
      };
      if (!staffPayload.email || !staffPayload.full_name) {
        return { status: 400, body: { error: 'STAFF_PROFILE_FIELDS_REQUIRED' } };
      }
    }

    const { data, error } = await serviceSupabase
      .from('user_profiles')
      .upsert(staffPayload, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };
    await serviceSupabase.from('audit_logs').insert({
      actor_id: actor.id,
      actor_name: actor.full_name,
      actor_role: actor.role,
      action: 'MANAGE_STAFF_MEMBER',
      target_type: 'user_profile',
      target_id: data.id,
      metadata: { role: data.role, assigned_branch_id: data.assigned_branch_id, is_active: data.is_active }
    });
    return { status: 200, body: { ok: true, staff: data } };
  }

  if (action === 'UPDATE_SITE_COPY') {
    const allowedKeys = ['heroKickerAr','heroTitleAr','heroTitleAccentAr','heroLeadAr','heroCtaAr','heroBranchesCtaAr','announcementAr','footerDescriptionAr','menuTitleAr','menuSubtitleAr'];
    const incoming = body.copy && typeof body.copy === 'object' ? body.copy : {};
    const copy = Object.fromEntries(allowedKeys.filter((key) => Object.prototype.hasOwnProperty.call(incoming, key)).map((key) => [key, String(incoming[key] || '').trim().slice(0, 220)]));
    if (!Object.keys(copy).length) return { status: 400, body: { error: 'SITE_COPY_EMPTY' } };
    const { data: current, error: readError } = await serviceSupabase.from('system_settings').select('draft_theme,published_theme').eq('id', 1).single();
    if (readError || !current) return { status: 400, body: { error: readError?.message || 'SITE_SETTINGS_NOT_FOUND' } };
    const nextDraft = { ...(current.draft_theme || {}), ...copy };
    const nextPublished = { ...(current.published_theme || {}), ...copy };
    const { data, error } = await serviceSupabase.from('system_settings').update({ draft_theme: nextDraft, published_theme: nextPublished, updated_at: new Date().toISOString(), updated_by: actor.id }).eq('id', 1).select('draft_theme,published_theme').single();
    if (error) return { status: 400, body: { error: error.message } };
    await serviceSupabase.from('audit_logs').insert({ actor_id: actor.id, actor_name: actor.full_name, actor_role: actor.role, action: 'UPDATE_SITE_COPY', target_type: 'system_settings', target_id: '1', metadata: { changed_fields: Object.keys(copy) } });
    return { status: 200, body: { ok: true, settings: data } };
  }

  if (action === 'UPDATE_THEME_CONFIG') {
    const { draft_theme, publish_now } = body;
    const updateObj = { draft_theme, updated_at: new Date().toISOString() };
    if (publish_now) {
      updateObj.published_theme = draft_theme;
    }
    const { data, error } = await serviceSupabase
      .from('system_settings')
      .update(updateObj)
      .eq('id', 1)
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };
    return { status: 200, body: { ok: true, settings: data } };
  }

  return { status: 400, body: { error: 'UNKNOWN_OWNER_ACTION' } };
}

/**
 * 6. Real Supabase Storage Media Upload Handler (POST /api/media/upload)
 * - Verifies session via `requireAuthenticatedProfile(authSupabase, ['super_admin', 'owner'])`
 * - Validates MIME type, size <= 5MB, and Magic Bytes binary signature
 * - Uploads buffer to Supabase Storage bucket `menu-media` and optionally updates `products.image_url`
 */
/** @param {{ authSupabase: any; serviceSupabase: any; fileName: string; mimeType: string; fileBuffer: Buffer; productId?: string | null }} args */
export async function handleMediaUploadRequest({
  authSupabase,
  serviceSupabase,
  fileName,
  mimeType,
  fileBuffer,
  productId = null
}) {
  const authCheck = await requireAuthenticatedProfile(authSupabase, ['super_admin', 'owner', 'branch_manager']);
  if (!authCheck.ok) {
    return {
      status: authCheck.status,
      body: { error: authCheck.code, message: authCheck.message }
    };
  }
  if (authCheck.profile.role === 'branch_manager') {
    return {
      status: 403,
      body: {
        error: 'BRANCH_MEDIA_SCOPE_NOT_IMPLEMENTED',
        message: 'رفع صور المنتجات من مدير الفرع متوقف مؤقتًا لأن المنتجات الحالية مشتركة بين الفروع.'
      }
    };
  }

  const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_BYTES = 5 * 1024 * 1024;

  if (!fileBuffer || fileBuffer.length === 0) {
    return { status: 400, body: { error: 'EMPTY_FILE_BUFFER' } };
  }
  if (!ALLOWED_MIMES.includes(mimeType)) {
    return { status: 415, body: { error: 'UNSUPPORTED_IMAGE_MIME_TYPE' } };
  }
  if (fileBuffer.length > MAX_BYTES) {
    return { status: 413, body: { error: 'IMAGE_EXCEEDS_5MB_LIMIT' } };
  }

  const magicCheck = verifyImageMagicBytes(fileBuffer, mimeType);
  if (!magicCheck.valid) {
    await serviceSupabase.from('security_abuse_logs').insert({
      event_type: 'MALICIOUS_OR_SPOOFED_IMAGE_UPLOAD',
      severity: 'high',
      details: { fileName, mimeType, reason: magicCheck.reason, actor: authCheck.profile.email }
    });
    return { status: 415, body: { error: 'INVALID_IMAGE_BINARY_SIGNATURE', message: magicCheck.reason } };
  }

  const safeName = String(fileName || `image.${magicCheck.format}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `products/${Date.now()}-${safeName}`;

  const { data: uploadData, error: uploadErr } = await serviceSupabase.storage
    .from('menu-media')
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false
    });

  if (uploadErr) {
    return { status: 500, body: { error: 'SUPABASE_STORAGE_UPLOAD_FAILED', message: uploadErr.message } };
  }

  const { data: pubUrlData } = serviceSupabase.storage
    .from('menu-media')
    .getPublicUrl(uploadData?.path || storagePath);

  const publicUrl = pubUrlData?.publicUrl;

  if (productId && publicUrl) {
    await serviceSupabase
      .from('products')
      .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', productId);
  }

  await serviceSupabase.from('audit_logs').insert({
    actor_id: authCheck.profile.id,
    actor_name: authCheck.profile.full_name,
    actor_role: authCheck.profile.role,
    action: 'UPLOAD_MENU_IMAGE',
    target_type: 'storage_object',
    target_id: storagePath,
    metadata: { public_url: publicUrl, size_bytes: fileBuffer.length, product_id: productId }
  });

  return {
    status: 201,
    body: {
      ok: true,
      storage_path: uploadData?.path || storagePath,
      public_url: publicUrl,
      mime_type: mimeType,
      size_bytes: fileBuffer.length
    }
  };
}
