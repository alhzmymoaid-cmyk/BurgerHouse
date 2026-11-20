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
      p_client_claimed_total: payload.client_claimed_total ?? null,
      p_check_timestamp: nowDate.toISOString()
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
        maintenance_message_ar: body.maintenance_message_ar || undefined,
        maintenance_message_en: body.maintenance_message_en || undefined,
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
    const { target_user_id, is_active, new_role, assigned_branch_id } = body;
    const updatePayload = { updated_at: new Date().toISOString() };
    if (typeof is_active === 'boolean') updatePayload.is_active = is_active;
    if (new_role) updatePayload.role = new_role;
    if (assigned_branch_id !== undefined) updatePayload.assigned_branch_id = assigned_branch_id;

    const { data, error } = await serviceSupabase
      .from('user_profiles')
      .update(updatePayload)
      .eq('id', target_user_id)
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };

    await serviceSupabase.from('audit_logs').insert({
      actor_id: superAdmin.id,
      actor_name: superAdmin.full_name,
      actor_role: superAdmin.role,
      action: 'MANAGE_USER_PROFILE_STATUS',
      target_type: 'user_profile',
      target_id: target_user_id,
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
    const { error } = await serviceSupabase
      .from('blocked_entities')
      .delete()
      .eq('entity_type', entity_type)
      .eq('entity_value', entity_value);

    if (error) return { status: 400, body: { error: error.message } };
    return { status: 200, body: { ok: true } };
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
  const authCheck = await requireAuthenticatedProfile(authSupabase, ['super_admin', 'owner']);
  if (!authCheck.ok) {
    return {
      status: authCheck.status,
      body: { error: authCheck.code, message: authCheck.message }
    };
  }

  const actor = authCheck.profile;
  const action = body?.action;

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
    const { data, error } = await serviceSupabase
      .from('products')
      .upsert({ ...productData, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };

    if (sizes && sizes.length) {
      const sizeRows = sizes.map((size, index) => ({
        id: String(size.id || ''),
        product_id: data.id,
        name_ar: String(size.name_ar || '').trim(),
        name_en: String(size.name_en || '').trim(),
        price_delta: Number(size.price_delta || 0),
        is_default: Boolean(size.is_default),
        sort_order: Number.isFinite(Number(size.sort_order)) ? Number(size.sort_order) : index
      })).filter((size) => size.id && size.name_ar && size.name_en);
      if (sizeRows.length) {
        const { error: sizesError } = await serviceSupabase
          .from('product_sizes')
          .upsert(sizeRows, { onConflict: 'id' });
        if (sizesError) return { status: 400, body: { error: sizesError.message } };
      }
    }

    await serviceSupabase.from('audit_logs').insert({
      actor_id: actor.id,
      actor_name: actor.full_name,
      actor_role: actor.role,
      action: 'UPSERT_PRODUCT',
      target_type: 'product',
      target_id: data.id,
      metadata: { base_price: data.base_price, sizes_saved: sizes?.length || 0 }
    });

    return { status: 200, body: { ok: true, product: data } };
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
    const staff = body.staff;
    // Owner can NEVER create or modify a super_admin or owner profile
    if (actor.role === 'owner' && !['branch_manager', 'cashier', 'kitchen_staff'].includes(staff.role)) {
      return {
        status: 403,
        body: { error: 'OWNER_CANNOT_ASSIGN_PRIVILEGED_ROLE' }
      };
    }

    const { data, error } = await serviceSupabase
      .from('user_profiles')
      .upsert(staff, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) return { status: 400, body: { error: error.message } };
    return { status: 200, body: { ok: true, staff: data } };
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
  const authCheck = await requireAuthenticatedProfile(authSupabase, ['super_admin', 'owner']);
  if (!authCheck.ok) {
    return {
      status: authCheck.status,
      body: { error: authCheck.code, message: authCheck.message }
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
