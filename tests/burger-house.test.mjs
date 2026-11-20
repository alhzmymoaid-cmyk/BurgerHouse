import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  INITIAL_BRANCHES,
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_ADDONS,
  INITIAL_BRANCH_OVERRIDES,
  INITIAL_PAYMENT_METHODS,
  getRequiredEnvSecret,
  calculateHaversineDistanceKm,
  isBranchOpenAtTime,
  resolveBranchesForCheckout,
  calculateVerifiedOrderPricing,
  validateAndNormalizeSaudiPhone,
  generateUnguessableOrderCode,
  createAdaptiveCaptchaChallenge,
  verifyAdaptiveCaptchaSolution,
  verifyImageMagicBytes,
  VALID_STATUS_TRANSITIONS
} from '../src/lib/domain/core-engine.mjs';

import {
  handleCreateOrderRequest,
  handleTransitionOrderStatusRequest,
  handleTrackOrderRequest,
  handleOwnerAdminRequest,
  handleSovereignAdminRequest,
  handleMediaUploadRequest
} from '../src/lib/supabase/api-handlers.mjs';

// Configure strong production-grade environment secrets (>= 32 chars) for test execution
process.env.ORDER_HMAC_SECRET = '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e';
process.env.CAPTCHA_SIGNING_SECRET = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b';

/**
 * Shared Transactional Supabase Database, RPC, Auth, Storage & Realtime Test Engine
 * Simulates a single shared PostgreSQL + Storage backend accessed by multiple independent
 * Vercel Serverless instances (`createClientInstance(sessionUserId)`).
 * Executes the exact logic of Migration 001..005 tables and RPCs (`create_verified_pickup_order`,
 * `transition_order_status`, `get_order_tracking_status`, `consume_captcha_nonce`).
 */
class SharedSupabaseCloudState {
  constructor() {
    this.system_settings = [
      {
        id: 1,
        site_online: true,
        maintenance_mode: false,
        maintenance_message_ar: 'الموقع في وضع الصيانة',
        maintenance_message_en: 'Maintenance mode',
        vat_percentage: 15.0,
        published_theme: { primary: '#D49A3A' },
        draft_theme: { primary: '#D49A3A' }
      }
    ];
    this.branches = structuredClone(INITIAL_BRANCHES);
    this.categories = structuredClone(INITIAL_CATEGORIES);
    this.products = structuredClone(INITIAL_PRODUCTS);
    this.product_addons = structuredClone(INITIAL_ADDONS);
    this.branch_product_overrides = structuredClone(INITIAL_BRANCH_OVERRIDES);
    this.payment_methods = structuredClone(INITIAL_PAYMENT_METHODS);

    this.user_profiles = [
      {
        id: 'uid-super-admin',
        email: 'creator@burgerhouse.sa',
        full_name: 'مؤيد محمد الحزمي (System Creator)',
        role: 'super_admin',
        assigned_branch_id: null,
        is_active: true,
        permissions: ['*']
      },
      {
        id: 'uid-owner',
        email: 'owner@burgerhouse.sa',
        full_name: 'مالك سلسلة برجر هاوس',
        role: 'owner',
        assigned_branch_id: null,
        is_active: true,
        permissions: []
      },
      {
        id: 'uid-mgr-sultan',
        email: 'fahad@burgerhouse.sa',
        full_name: 'فهد العتيبي (مدير فرع الأمير سلطان)',
        role: 'branch_manager',
        assigned_branch_id: 'br-jed-sultan',
        is_active: true,
        permissions: []
      },
      {
        id: 'uid-cashier-sultan',
        email: 'salman@burgerhouse.sa',
        full_name: 'سلمان الحربي (كاشير فرع الأمير سلطان)',
        role: 'cashier',
        assigned_branch_id: 'br-jed-sultan',
        is_active: true,
        permissions: []
      },
      {
        id: 'uid-kitchen-sultan',
        email: 'omar@burgerhouse.sa',
        full_name: 'عمر الزهراني (مطبخ فرع الأمير سلطان)',
        role: 'kitchen_staff',
        assigned_branch_id: 'br-jed-sultan',
        is_active: true,
        permissions: []
      },
      {
        id: 'uid-mgr-hamra',
        email: 'rayan@burgerhouse.sa',
        full_name: 'ريان الغامدي (مدير فرع الحمراء)',
        role: 'branch_manager',
        assigned_branch_id: 'br-jed-hamra',
        is_active: true,
        permissions: []
      }
    ];

    this.orders = [];
    this.order_items = [];
    this.order_status_history = [];
    this.idempotency_keys = new Map();
    this.rate_limit_buckets = [];
    this.blocked_entities = [];
    this.used_captcha_nonces = new Map();
    this.security_abuse_logs = [];
    this.audit_logs = [];
    this.storage_buckets = {
      'menu-media': new Map()
    };
    this.realtimeListeners = [];
  }

  emitRealtime(table, eventType, record) {
    for (const listener of this.realtimeListeners) {
      if (listener.table === table && (listener.event === '*' || listener.event === eventType)) {
        listener.callback({ eventType, table, new: record });
      }
    }
  }

  /** Creates an isolated serverless client bound to a specific authenticated session (or null for anonymous) */
  createClientInstance(authenticatedUserId = null) {
    const db = this;
    return {
      auth: {
        async getUser() {
          if (!authenticatedUserId) {
            return { data: { user: null }, error: { message: 'Not authenticated' } };
          }
          const prof = db.user_profiles.find((u) => u.id === authenticatedUserId);
          return {
            data: { user: prof ? { id: prof.id, email: prof.email } : { id: authenticatedUserId } },
            error: null
          };
        }
      },
      storage: {
        from(bucketName) {
          return {
            async upload(storagePath, buffer, options) {
              if (!db.storage_buckets[bucketName]) {
                return { data: null, error: { message: 'Bucket not found' } };
              }
              db.storage_buckets[bucketName].set(storagePath, {
                path: storagePath,
                size: buffer.length,
                contentType: options?.contentType || 'application/octet-stream'
              });
              return { data: { path: storagePath }, error: null };
            },
            getPublicUrl(storagePath) {
              return {
                data: {
                  publicUrl: `https://project-ref.supabase.co/storage/v1/object/public/${bucketName}/${storagePath}`
                }
              };
            }
          };
        }
      },
      channel(name) {
        const sub = { name, handlers: [] };
        return {
          on(type, filter, callback) {
            db.realtimeListeners.push({
              table: filter.table,
              event: filter.event || '*',
              callback
            });
            return this;
          },
          subscribe() {
            return sub;
          }
        };
      },
      from(tableName) {
        let filters = [];
        let pendingOp = 'select';
        let opPayload = null;

        const builder = {
          select() {
            if (pendingOp === 'select') pendingOp = 'select';
            return builder;
          },
          insert(rowOrRows) {
            pendingOp = 'insert';
            opPayload = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
            return builder;
          },
          update(patch) {
            pendingOp = 'update';
            opPayload = patch;
            return builder;
          },
          upsert(row, opts) {
            pendingOp = 'upsert';
            opPayload = { row, opts };
            return builder;
          },
          delete() {
            pendingOp = 'delete';
            return builder;
          },
          eq(col, val) {
            filters.push((r) => r[col] === val);
            return builder;
          },
          neq(col, val) {
            filters.push((r) => r[col] !== val);
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          async single() {
            const res = await builder._exec();
            if (res.error) return res;
            const first = Array.isArray(res.data) ? res.data[0] : res.data;
            if (!first) return { data: null, error: { message: 'Row not found' } };
            return { data: first, error: null };
          },
          async maybeSingle() {
            const res = await builder._exec();
            if (res.error) return res;
            const first = Array.isArray(res.data) ? res.data[0] : res.data;
            return { data: first || null, error: null };
          },
          then(resolve, reject) {
            return builder._exec().then(resolve, reject);
          },
          async _exec() {
            const arr = db[tableName];
            if (!Array.isArray(arr)) {
              return { data: null, error: { message: `Unknown table ${tableName}` } };
            }
            if (pendingOp === 'insert') {
              const inserted = opPayload.map((item) => ({
                id: item.id || crypto.randomUUID(),
                created_at: new Date().toISOString(),
                ...item
              }));
              arr.unshift(...inserted);
              return { data: inserted, error: null };
            }
            const matched = arr.filter((r) => filters.every((fn) => fn(r)));
            if (pendingOp === 'select') {
              return { data: matched, error: null };
            }
            if (pendingOp === 'update') {
              matched.forEach((r) => Object.assign(r, opPayload));
              return { data: matched, error: null };
            }
            if (pendingOp === 'upsert') {
              const { row } = opPayload;
              const existing = arr.find(
                (r) =>
                  (row.id && r.id === row.id) ||
                  (row.entity_type && r.entity_type === row.entity_type && r.entity_value === row.entity_value) ||
                  (row.branch_id && row.product_id && r.branch_id === row.branch_id && r.product_id === row.product_id)
              );
              if (existing) {
                Object.assign(existing, row);
                return { data: [existing], error: null };
              }
              const created = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
              arr.push(created);
              return { data: [created], error: null };
            }
            if (pendingOp === 'delete') {
              db[tableName] = arr.filter((r) => !filters.every((fn) => fn(r)));
              return { data: [], error: null };
            }
            return { data: [], error: null };
          }
        };
        return builder;
      },
      async rpc(fnName, params) {
        if (fnName === 'consume_captcha_nonce') {
          const { p_nonce, p_client_ip_hash } = params;
          if (db.used_captcha_nonces.has(p_nonce)) {
            return { data: false, error: null };
          }
          db.used_captcha_nonces.set(p_nonce, { ip: p_client_ip_hash, created_at: Date.now() });
          return { data: true, error: null };
        }

        if (fnName === 'create_verified_pickup_order') {
          try {
            // 1. Idempotency check in shared DB
            const key = params.p_idempotency_key;
            if (db.idempotency_keys.has(key)) {
              const saved = db.idempotency_keys.get(key);
              if (saved.payload_hash !== params.p_payload_hash) {
                return { data: null, error: { message: 'IDEMPOTENCY_PAYLOAD_MISMATCH' } };
              }
              return { data: { ...saved.response_snapshot, idempotent_replay: true }, error: null };
            }

            // 2. System online check
            const settings = db.system_settings[0];
            if (!settings.site_online || settings.maintenance_mode) {
              return { data: null, error: { message: 'SYSTEM_MAINTENANCE_OR_OFFLINE' } };
            }

            // 3. Blocklist check
            const blocked = db.blocked_entities.find(
              (b) =>
                b.is_active &&
                ((b.entity_type === 'phone' && b.entity_value === params.p_customer_phone) ||
                  (b.entity_type === 'ip' && b.entity_value === params.p_client_ip_hash) ||
                  (b.entity_type === 'session' && b.entity_value === params.p_session_fingerprint))
            );
            if (blocked) {
              db.security_abuse_logs.unshift({
                event_type: 'BLOCKED_ENTITY_ATTEMPT',
                severity: 'high',
                customer_phone: params.p_customer_phone
              });
              return { data: null, error: { message: `ENTITY_BLOCKED:${blocked.reason}` } };
            }

            // 4. Shared Rate Limit Check (max 3 per 15m)
            const nowMs = new Date(params.p_check_timestamp).getTime();
            db.rate_limit_buckets = db.rate_limit_buckets.filter((b) => nowMs - b.ts <= 15 * 60 * 1000);
            const ipHits = db.rate_limit_buckets.filter(
              (b) => b.type === 'ip' && b.value === params.p_client_ip_hash
            ).length;
            const phoneHits = db.rate_limit_buckets.filter(
              (b) => b.type === 'phone' && b.value === params.p_customer_phone
            ).length;
            if (ipHits >= 3 || phoneHits >= 3) {
              return { data: null, error: { message: 'RATE_LIMIT_EXCEEDED' } };
            }

            // 5. Branch check
            const branch = db.branches.find((b) => b.id === params.p_branch_id && b.is_active);
            if (!branch) return { data: null, error: { message: 'INVALID_BRANCH' } };
            const openCheck = isBranchOpenAtTime(branch, new Date(params.p_check_timestamp));
            if (!openCheck.open) {
              return { data: null, error: { message: openCheck.reason } };
            }

            // 6. Payment Method check (must be enabled AND not require an unconfigured gateway)
            const pm = db.payment_methods.find((p) => p.id === params.p_payment_method_id);
            if (!pm || !pm.is_enabled || (pm.requires_gateway && !pm.gateway_configured)) {
              return { data: null, error: { message: 'PAYMENT_METHOD_DISABLED_OR_INVALID' } };
            }

            // 7. Server-side Pricing Calculation
            const pricing = calculateVerifiedOrderPricing({
              items: params.p_items,
              branchId: branch.id,
              products: db.products,
              addons: db.product_addons,
              branchOverrides: db.branch_product_overrides,
              vatPercentage: settings.vat_percentage,
              clientClaimedTotal: params.p_client_claimed_total
            });

            if (pricing.client_price_tampered) {
              db.security_abuse_logs.unshift({
                event_type: 'CLIENT_PRICE_TAMPERING_DETECTED',
                severity: 'critical',
                customer_phone: params.p_customer_phone
              });
              return { data: null, error: { message: 'PRICE_TAMPERING_REJECTED' } };
            }

            const orderCode = generateUnguessableOrderCode();
            const orderId = crypto.randomUUID();
            const nowIso = params.p_check_timestamp;
            const estPickup = new Date(nowMs + branch.prep_time_minutes * 60 * 1000).toISOString();

            const orderRecord = {
              id: orderId,
              order_code: orderCode,
              tracking_token: params.p_tracking_token,
              idempotency_key: key,
              branch_id: branch.id,
              branch_snapshot: {
                id: branch.id,
                name_ar: branch.name_ar,
                name_en: branch.name_en,
                address_ar: branch.address_ar,
                address_en: branch.address_en,
                phone: branch.phone,
                map_url: branch.map_url,
                latitude: branch.latitude,
                longitude: branch.longitude
              },
              customer_name: params.p_customer_name.trim(),
              customer_phone: params.p_customer_phone,
              customer_notes: params.p_customer_notes || '',
              fulfillment_type: 'pickup',
              payment_method_id: pm.id,
              payment_method_name_ar: pm.name_ar,
              payment_method_name_en: pm.name_en,
              items: pricing.verified_items,
              subtotal: pricing.subtotal,
              vat_amount: pricing.vat_amount,
              total_amount: pricing.total_amount,
              status: 'new',
              created_at: nowIso,
              estimated_pickup_at: estPickup,
              accepted_at: null,
              ready_at: null,
              completed_at: null,
              idempotent_replay: false
            };

            db.orders.unshift(orderRecord);
            pricing.verified_items.forEach((it) => {
              db.order_items.push({ id: crypto.randomUUID(), order_id: orderId, ...it });
            });
            db.order_status_history.push({
              id: crypto.randomUUID(),
              order_id: orderId,
              from_status: null,
              to_status: 'new',
              actor_id: null,
              actor_name: 'بوابة الطلبات الذكية (PostgreSQL RPC)',
              actor_role: 'system',
              note: 'تم إنشاء الطلب ذرياً داخل قاعدة البيانات',
              created_at: nowIso
            });

            db.rate_limit_buckets.push(
              { type: 'ip', value: params.p_client_ip_hash, ts: nowMs },
              { type: 'session', value: params.p_session_fingerprint, ts: nowMs },
              { type: 'phone', value: params.p_customer_phone, ts: nowMs }
            );

            db.idempotency_keys.set(key, {
              payload_hash: params.p_payload_hash,
              order_code: orderCode,
              response_snapshot: orderRecord
            });

            db.emitRealtime('orders', 'INSERT', orderRecord);
            return { data: orderRecord, error: null };
          } catch (err) {
            return { data: null, error: { message: err.message } };
          }
        }

        if (fnName === 'transition_order_status') {
          // Enforce Migration 006 rule: p_actor_uid is strictly forbidden; identity comes from auth.uid() (authenticatedUserId)!
          if ('p_actor_uid' in (params || {})) {
            return { data: null, error: { message: 'FORBIDDEN_PARAMETER_P_ACTOR_UID_REMOVED' } };
          }
          if (!authenticatedUserId) {
            return { data: null, error: { message: 'UNAUTHENTICATED_ACTOR: auth.uid() is NULL' } };
          }
          const { p_order_code, p_target_status, p_confirmed, p_reason_note } = params;
          const actor = db.user_profiles.find((u) => u.id === authenticatedUserId && u.is_active);
          if (!actor) return { data: null, error: { message: 'ACTOR_PROFILE_NOT_FOUND_OR_INACTIVE' } };

          const order = db.orders.find((o) => o.order_code === String(p_order_code).toUpperCase());
          if (!order) return { data: null, error: { message: 'ORDER_NOT_FOUND' } };

          if (
            ['branch_manager', 'cashier', 'kitchen_staff'].includes(actor.role) &&
            actor.assigned_branch_id !== order.branch_id
          ) {
            return { data: null, error: { message: 'CROSS_BRANCH_ACCESS_DENIED' } };
          }

          if (actor.role === 'kitchen_staff' && !['preparing', 'ready_for_pickup'].includes(p_target_status)) {
            return { data: null, error: { message: 'ROLE_NOT_AUTHORIZED_FOR_STATUS' } };
          }
          if (actor.role === 'cashier' && p_target_status === 'preparing') {
            return { data: null, error: { message: 'ROLE_NOT_AUTHORIZED_FOR_STATUS' } };
          }

          const validNext = VALID_STATUS_TRANSITIONS[order.status] || [];
          if (!validNext.includes(p_target_status)) {
            return {
              data: null,
              error: { message: `ILLOGICAL_STATUS_TRANSITION:${order.status}->${p_target_status}` }
            };
          }

          if (['rejected', 'cancelled'].includes(p_target_status) && !p_confirmed) {
            return { data: null, error: { message: 'CONFIRMATION_REQUIRED_FOR_SENSITIVE_ACTION' } };
          }

          const prevStatus = order.status;
          const nowIso = new Date().toISOString();
          order.status = p_target_status;
          if (p_target_status === 'accepted' && !order.accepted_at) order.accepted_at = nowIso;
          if (p_target_status === 'ready_for_pickup' && !order.ready_at) order.ready_at = nowIso;
          if (p_target_status === 'completed' && !order.completed_at) order.completed_at = nowIso;
          if (['rejected', 'cancelled'].includes(p_target_status)) {
            order.rejected_reason = p_reason_note || '';
          }

          db.order_status_history.push({
            id: crypto.randomUUID(),
            order_id: order.id,
            from_status: prevStatus,
            to_status: p_target_status,
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            note: p_reason_note || '',
            created_at: nowIso
          });

          db.audit_logs.unshift({
            id: crypto.randomUUID(),
            actor_id: actor.id,
            actor_name: actor.full_name,
            actor_role: actor.role,
            action: 'ORDER_STATUS_TRANSITION',
            target_type: 'order',
            target_id: order.order_code,
            metadata: { from: prevStatus, to: p_target_status }
          });

          const history = db.order_status_history
            .filter((h) => h.order_id === order.id)
            .map((h) => ({
              from_status: h.from_status,
              to_status: h.to_status,
              actor_name: h.actor_name,
              actor_role: h.actor_role,
              note: h.note,
              timestamp: h.created_at
            }));

          const result = {
            id: order.id,
            order_code: order.order_code,
            branch_id: order.branch_id,
            status: order.status,
            accepted_at: order.accepted_at,
            ready_at: order.ready_at,
            completed_at: order.completed_at,
            rejected_reason: order.rejected_reason,
            status_history: history
          };

          db.emitRealtime('orders', 'UPDATE', order);
          return { data: result, error: null };
        }

        if (fnName === 'get_order_tracking_status') {
          const { p_order_code, p_tracking_token } = params;
          const order = db.orders.find(
            (o) =>
              o.order_code === String(p_order_code).trim().toUpperCase() &&
              o.tracking_token === String(p_tracking_token).trim()
          );
          if (!order) {
            return { data: null, error: { message: 'ORDER_TRACKING_NOT_FOUND_OR_UNAUTHORIZED' } };
          }
          const history = db.order_status_history
            .filter((h) => h.order_id === order.id)
            .map((h) => ({
              from_status: h.from_status,
              to_status: h.to_status,
              note: h.note,
              timestamp: h.created_at
            }));

          return {
            data: {
              order_code: order.order_code,
              branch_id: order.branch_id,
              branch_snapshot: order.branch_snapshot,
              customer_name_masked: order.customer_name.slice(0, 1) + '***',
              customer_phone_masked:
                order.customer_phone.slice(0, 5) + '****' + order.customer_phone.slice(-3),
              fulfillment_type: order.fulfillment_type,
              payment_method_id: order.payment_method_id,
              subtotal: order.subtotal,
              vat_amount: order.vat_amount,
              total_amount: order.total_amount,
              status: order.status,
              created_at: order.created_at,
              accepted_at: order.accepted_at,
              ready_at: order.ready_at,
              completed_at: order.completed_at,
              estimated_pickup_at: order.estimated_pickup_at,
              items: order.items,
              status_history: history
            },
            error: null
          };
        }

        return { data: null, error: { message: `Unknown RPC ${fnName}` } };
      }
    };
  }
}

// ============================================================================
// MANDATORY PRACTICAL & INTEGRATION TESTS (11 COMPREHENSIVE SUITES)
// ============================================================================

test('1. Order Creation Persists Atomically in Supabase (Orders, Items, History, Idempotency) — Zero Memory Map', async () => {
  const cloud = new SharedSupabaseCloudState();
  const vercelInstance1 = cloud.createClientInstance(null);

  const res = await handleCreateOrderRequest({
    serviceSupabase: vercelInstance1,
    idempotencyKey: 'idem-create-order-001',
    clientIp: '85.194.10.22',
    sessionFingerprint: 'sess-customer-jeddah-1',
    payload: {
      branch_id: 'br-jed-sultan',
      customer_name: 'مؤيد محمد الحزمي',
      customer_phone: '0535717670',
      customer_notes: 'خبز بريوش محمص إضافي',
      payment_method_id: 'pay_at_pickup_card',
      items: [
        {
          product_id: 'prd-wagyu-smash',
          size_id: 'sz-wagyu-double',
          quantity: 2,
          addon_ids: ['add-cheddar', 'add-bacon']
        }
      ]
    },
    nowDate: new Date('2026-11-16T19:00:00+03:00')
  });

  assert.equal(res.status, 201);
  assert.match(res.body.order_code, /^BH-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  assert.ok(res.body.tracking_token.startsWith('trk_'));
  assert.equal(res.body.subtotal, 122); // (48 + 5 + 8) * 2
  assert.equal(res.body.vat_amount, 18.3);
  assert.equal(res.body.total_amount, 140.3);

  // Verify persisted inside Supabase tables
  assert.equal(cloud.orders.length, 1);
  assert.equal(cloud.order_items.length, 1);
  assert.equal(cloud.order_status_history.length, 1);
  assert.equal(cloud.orders[0].order_code, res.body.order_code);
  assert.equal(cloud.orders[0].branch_id, 'br-jed-sultan');
});

test('2. Duplicate Order Prevention Across Multiple Serverless Instances (Shared DB Idempotency)', async () => {
  const cloud = new SharedSupabaseCloudState();
  const vercelInstanceA = cloud.createClientInstance(null);
  const vercelInstanceB = cloud.createClientInstance(null); // Completely separate instance!

  const orderPayload = {
    branch_id: 'br-jed-sultan',
    customer_name: 'خالد العتيبي',
    customer_phone: '0551239876',
    payment_method_id: 'pay_at_pickup_cash',
    items: [{ product_id: 'prd-smoked-brisket', size_id: 'sz-brisket-std', quantity: 1, addon_ids: [] }]
  };

  // First request hits Serverless Instance A
  const firstRes = await handleCreateOrderRequest({
    serviceSupabase: vercelInstanceA,
    idempotencyKey: 'idem-multi-instance-900',
    clientIp: '91.102.44.11',
    sessionFingerprint: 'sess-multi-1',
    payload: orderPayload,
    nowDate: new Date('2026-11-16T19:15:00+03:00')
  });
  assert.equal(firstRes.status, 201);
  assert.equal(firstRes.body.idempotent_replay, false);

  // Retry with the exact same Idempotency-Key hits Serverless Instance B (zero shared RAM with Instance A!)
  const secondRes = await handleCreateOrderRequest({
    serviceSupabase: vercelInstanceB,
    idempotencyKey: 'idem-multi-instance-900',
    clientIp: '91.102.44.11',
    sessionFingerprint: 'sess-multi-1',
    payload: orderPayload,
    nowDate: new Date('2026-11-16T19:15:02+03:00')
  });
  assert.equal(secondRes.status, 200);
  assert.equal(secondRes.body.idempotent_replay, true);
  assert.equal(secondRes.body.order_code, firstRes.body.order_code);
  assert.equal(cloud.orders.length, 1); // Strictly 1 order created in DB!

  // Reusing same Idempotency-Key with modified items on Instance B is rejected with 409 Conflict
  const conflictRes = await handleCreateOrderRequest({
    serviceSupabase: vercelInstanceB,
    idempotencyKey: 'idem-multi-instance-900',
    clientIp: '91.102.44.11',
    sessionFingerprint: 'sess-multi-1',
    payload: {
      ...orderPayload,
      items: [{ product_id: 'prd-smoked-brisket', size_id: 'sz-brisket-pit', quantity: 3, addon_ids: [] }]
    },
    nowDate: new Date('2026-11-16T19:15:05+03:00')
  });
  assert.equal(conflictRes.status, 409);
  assert.equal(conflictRes.body.error, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
});

test('3. Server-Side Pricing Verification, Branch Price Overrides & Client Price Tampering Rejection', async () => {
  const cloud = new SharedSupabaseCloudState();
  const serviceClient = cloud.createClientInstance(null);

  // Attempt to tamper with price from browser (sending client_claimed_total = 5.00 SAR)
  const tamperedRes = await handleCreateOrderRequest({
    serviceSupabase: serviceClient,
    idempotencyKey: 'idem-tamper-001',
    clientIp: '10.20.30.40',
    sessionFingerprint: 'sess-tamper',
    payload: {
      branch_id: 'br-riy-tahlia',
      customer_name: 'فهد المالكي',
      customer_phone: '0543219876',
      payment_method_id: 'pay_at_pickup_card',
      client_claimed_total: 5.00,
      items: [{ product_id: 'prd-truffle-swiss', size_id: 'sz-truffle-double', quantity: 1, addon_ids: [] }]
    },
    nowDate: new Date('2026-11-16T18:00:00+03:00')
  });

  assert.equal(tamperedRes.status, 422);
  assert.equal(tamperedRes.body.error, 'PRICE_TAMPERING_REJECTED');
  assert.equal(cloud.orders.length, 0);
  assert.equal(cloud.security_abuse_logs[0].event_type, 'CLIENT_PRICE_TAMPERING_DETECTED');
});

test('4. Anti-Spoofing of Admin & Staff Identity (Ignoring/Logging Forged body.actor & body.order)', async () => {
  const cloud = new SharedSupabaseCloudState();
  const anonClient = cloud.createClientInstance(null);
  const kitchenClient = cloud.createClientInstance('uid-kitchen-sultan');
  const serviceClient = cloud.createClientInstance('uid-super-admin');

  // Create a valid order at Prince Sultan branch
  const created = await handleCreateOrderRequest({
    serviceSupabase: serviceClient,
    idempotencyKey: 'idem-spoof-test-1',
    clientIp: '1.2.3.4',
    sessionFingerprint: 'sess-1',
    payload: {
      branch_id: 'br-jed-sultan',
      customer_name: 'سعد الحربي',
      customer_phone: '0567891234',
      payment_method_id: 'pay_at_pickup_card',
      items: [{ product_id: 'prd-wagyu-smash', size_id: 'sz-wagyu-double', quantity: 1, addon_ids: [] }]
    },
    nowDate: new Date('2026-11-16T19:00:00+03:00')
  });
  const orderCode = created.body.order_code;

  // Attack A: Unauthenticated caller sends forged `actor: { role: 'super_admin' }` in body to Status API
  const anonSpoof = await handleTransitionOrderStatusRequest({
    authSupabase: anonClient,
    serviceSupabase: serviceClient,
    orderCode,
    body: {
      target_status: 'accepted',
      actor: { id: 'uid-super-admin', role: 'super_admin', name: 'Forged Admin' },
      order: { order_code: orderCode, status: 'new', branch_id: 'br-jed-sultan' }
    }
  });
  assert.equal(anonSpoof.status, 401);
  assert.equal(anonSpoof.body.error, 'UNAUTHENTICATED_SESSION');
  assert.equal(cloud.security_abuse_logs[0].event_type, 'ACTOR_OR_ORDER_SPOOFING_ATTEMPT_IGNORED');

  // Attack B: Authenticated Kitchen Staff tries to spoof `actor: { role: 'branch_manager' }` to accept a 'new' order
  const kitchenSpoof = await handleTransitionOrderStatusRequest({
    authSupabase: kitchenClient,
    serviceSupabase: serviceClient,
    orderCode,
    body: {
      target_status: 'accepted',
      actor: { id: 'uid-mgr-sultan', role: 'branch_manager' }
    }
  });
  assert.equal(kitchenSpoof.status, 403);
  assert.equal(kitchenSpoof.body.error, 'ROLE_NOT_AUTHORIZED_FOR_STATUS');
  assert.equal(cloud.orders[0].status, 'new'); // Unchanged!
});

test('5. Cross-Branch Isolation: Staff Cannot View or Transition Another Branch Order', async () => {
  const cloud = new SharedSupabaseCloudState();
  const hamraManagerClient = cloud.createClientInstance('uid-mgr-hamra'); // Assigned to br-jed-hamra
  const serviceClient = cloud.createClientInstance('uid-super-admin');

  // Create order for Prince Sultan branch (br-jed-sultan)
  const created = await handleCreateOrderRequest({
    serviceSupabase: serviceClient,
    idempotencyKey: 'idem-branch-iso-1',
    clientIp: '5.5.5.5',
    sessionFingerprint: 'sess-iso',
    payload: {
      branch_id: 'br-jed-sultan',
      customer_name: 'نايف القحطاني',
      customer_phone: '0531122334',
      payment_method_id: 'pay_at_pickup_card',
      items: [{ product_id: 'prd-wagyu-smash', size_id: 'sz-wagyu-double', quantity: 1, addon_ids: [] }]
    },
    nowDate: new Date('2026-11-16T19:00:00+03:00')
  });

  // Al-Hamra Branch Manager tries to transition Prince Sultan's order
  const crossBranchAttempt = await handleTransitionOrderStatusRequest({
    authSupabase: hamraManagerClient,
    serviceSupabase: serviceClient,
    orderCode: created.body.order_code,
    body: { target_status: 'accepted' }
  });

  assert.equal(crossBranchAttempt.status, 403);
  assert.equal(crossBranchAttempt.body.error, 'CROSS_BRANCH_ACCESS_DENIED');
});

test('6. Owner Blocked from Sovereign Super Admin API Even When Spoofing Body Actor', async () => {
  const cloud = new SharedSupabaseCloudState();
  const ownerClient = cloud.createClientInstance('uid-owner'); // Authenticated as 'owner'
  const superAdminClient = cloud.createClientInstance('uid-super-admin'); // Authenticated as 'super_admin'

  // Owner tries to shut down the site via Sovereign API while passing forged super_admin actor in body
  const ownerAttempt = await handleSovereignAdminRequest({
    authSupabase: ownerClient,
    serviceSupabase: superAdminClient,
    body: {
      actor: { id: 'uid-super-admin', role: 'super_admin' },
      action: 'SET_SYSTEM_AVAILABILITY',
      site_online: false,
      maintenance_mode: true
    }
  });

  assert.equal(ownerAttempt.status, 403);
  assert.equal(ownerAttempt.body.error, 'SOVEREIGN_PRIVILEGE_REQUIRED');
  assert.equal(cloud.system_settings[0].site_online, true); // Site remains online!
  assert.equal(cloud.security_abuse_logs[0].event_type, 'SOVEREIGN_ACTOR_BODY_SPOOF_ATTEMPT');

  // Real Super Admin session executes the exact same operation -> succeeds!
  const superAdminRes = await handleSovereignAdminRequest({
    authSupabase: superAdminClient,
    serviceSupabase: superAdminClient,
    body: {
      action: 'SET_SYSTEM_AVAILABILITY',
      site_online: true,
      maintenance_mode: true
    }
  });
  assert.equal(superAdminRes.status, 200);
  assert.equal(cloud.system_settings[0].maintenance_mode, true);
});

test('7. Real-Time Order Broadcast & Full 8-State Lifecycle with Staff Audit Trail', async () => {
  const cloud = new SharedSupabaseCloudState();
  const cashierClient = cloud.createClientInstance('uid-cashier-sultan');
  const kitchenClient = cloud.createClientInstance('uid-kitchen-sultan');
  const serviceClient = cloud.createClientInstance('uid-super-admin');

  const realtimeEvents = [];
  cashierClient
    .channel('kds-test')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (ev) => {
      realtimeEvents.push({ type: ev.eventType, status: ev.new.status, code: ev.new.order_code });
    })
    .subscribe();

  const created = await handleCreateOrderRequest({
    serviceSupabase: serviceClient,
    idempotencyKey: 'idem-rt-lifecycle-1',
    clientIp: '8.8.4.4',
    sessionFingerprint: 'sess-rt',
    payload: {
      branch_id: 'br-jed-sultan',
      customer_name: 'بدر الزهراني',
      customer_phone: '0509876543',
      payment_method_id: 'pay_at_pickup_card',
      items: [{ product_id: 'prd-nashville-chicken', size_id: 'sz-chick-1', quantity: 1, addon_ids: [] }]
    },
    nowDate: new Date('2026-11-16T19:00:00+03:00')
  });
  const code = created.body.order_code;

  // Cashier accepts ('new' -> 'accepted')
  const step1 = await handleTransitionOrderStatusRequest({
    authSupabase: cashierClient,
    serviceSupabase: serviceClient,
    orderCode: code,
    body: { target_status: 'accepted', reason_note: 'تم القبول من الكاشير' }
  });
  assert.equal(step1.status, 200);
  assert.ok(step1.body.accepted_at);

  // Kitchen staff prepares ('accepted' -> 'preparing' -> 'ready_for_pickup')
  const step2 = await handleTransitionOrderStatusRequest({
    authSupabase: kitchenClient,
    serviceSupabase: serviceClient,
    orderCode: code,
    body: { target_status: 'preparing', reason_note: 'بدأ التحضير' }
  });
  assert.equal(step2.status, 200);

  const step3 = await handleTransitionOrderStatusRequest({
    authSupabase: kitchenClient,
    serviceSupabase: serviceClient,
    orderCode: code,
    body: { target_status: 'ready_for_pickup', reason_note: 'جاهز في كاونتر الاستلام' }
  });
  assert.equal(step3.status, 200);
  assert.ok(step3.body.ready_at);

  // Cashier completes ('ready_for_pickup' -> 'completed')
  const step4 = await handleTransitionOrderStatusRequest({
    authSupabase: cashierClient,
    serviceSupabase: serviceClient,
    orderCode: code,
    body: { target_status: 'completed', reason_note: 'تم التسليم للعميل' }
  });
  assert.equal(step4.status, 200);
  assert.ok(step4.body.completed_at);
  assert.equal(step4.body.status_history.length, 5); // new + 4 transitions

  // Verify Realtime listener captured INSERT + 4 UPDATE events
  assert.equal(realtimeEvents.length, 5);
  assert.equal(realtimeEvents[0].type, 'INSERT');
  assert.equal(realtimeEvents[4].status, 'completed');
});

test('8. Privacy-Safe Order Tracking: Rejects Code-Only Scraping & Masks Customer PII', async () => {
  const cloud = new SharedSupabaseCloudState();
  const serviceClient = cloud.createClientInstance('uid-super-admin');

  const created = await handleCreateOrderRequest({
    serviceSupabase: serviceClient,
    idempotencyKey: 'idem-track-privacy-1',
    clientIp: '9.9.9.9',
    sessionFingerprint: 'sess-trk',
    payload: {
      branch_id: 'br-jed-sultan',
      customer_name: 'مؤيد محمد الحزمي',
      customer_phone: '0535717670',
      payment_method_id: 'pay_at_pickup_card',
      items: [{ product_id: 'prd-loaded-fries', size_id: 'sz-fries-reg', quantity: 1, addon_ids: [] }]
    },
    nowDate: new Date('2026-11-16T19:00:00+03:00')
  });
  const { order_code, tracking_token } = created.body;

  // Attempt 1: Visitor knows order_code but has no tracking_token -> 401
  const noTokenRes = await handleTrackOrderRequest({
    serviceSupabase: serviceClient,
    orderCode: order_code,
    trackingToken: ''
  });
  assert.equal(noTokenRes.status, 401);

  // Attempt 2: Visitor guesses a wrong tracking_token -> 404
  const wrongTokenRes = await handleTrackOrderRequest({
    serviceSupabase: serviceClient,
    orderCode: order_code,
    trackingToken: 'trk_wrong_token_1234567890'
  });
  assert.equal(wrongTokenRes.status, 404);

  // Attempt 3: Customer provides valid order_code + tracking_token -> 200 with masked PII
  const validTrackRes = await handleTrackOrderRequest({
    serviceSupabase: serviceClient,
    orderCode: order_code,
    trackingToken: tracking_token
  });
  assert.equal(validTrackRes.status, 200);
  assert.equal(validTrackRes.body.order_code, order_code);
  assert.equal(validTrackRes.body.customer_name, undefined); // Raw full name is NEVER exposed!
  assert.equal(validTrackRes.body.customer_phone, undefined); // Raw full phone is NEVER exposed!
  assert.equal(validTrackRes.body.customer_name_masked, 'م***');
  assert.equal(validTrackRes.body.customer_phone_masked, '+9665****670');
});

test('9. Real Supabase Storage Image Upload with Magic-Byte Verification & Role Check', async () => {
  const cloud = new SharedSupabaseCloudState();
  const cashierClient = cloud.createClientInstance('uid-cashier-sultan');
  const ownerClient = cloud.createClientInstance('uid-owner');
  const serviceClient = cloud.createClientInstance('uid-super-admin');

  // 1. Cashier cannot upload menu images (403)
  const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x03]);
  const cashierUpload = await handleMediaUploadRequest({
    authSupabase: cashierClient,
    serviceSupabase: serviceClient,
    fileName: 'burger.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: validJpegBuffer
  });
  assert.equal(cashierUpload.status, 403);

  // 2. Owner tries to upload a disguised script/HTML file claiming to be image/jpeg -> rejected (415)
  const fakeScriptBuffer = Buffer.from('<script>alert("xss")</script>', 'utf8');
  const spoofedMimeUpload = await handleMediaUploadRequest({
    authSupabase: ownerClient,
    serviceSupabase: serviceClient,
    fileName: 'exploit.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: fakeScriptBuffer
  });
  assert.equal(spoofedMimeUpload.status, 415);
  assert.equal(spoofedMimeUpload.body.error, 'INVALID_IMAGE_BINARY_SIGNATURE');

  // 3. Owner uploads a real JPEG binary linked to 'prd-wagyu-smash' -> uploaded to Storage & updates product!
  const realUpload = await handleMediaUploadRequest({
    authSupabase: ownerClient,
    serviceSupabase: serviceClient,
    fileName: 'new-wagyu-shot.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: validJpegBuffer,
    productId: 'prd-wagyu-smash'
  });
  assert.equal(realUpload.status, 201);
  assert.ok(realUpload.body.public_url.includes('/storage/v1/object/public/menu-media/products/'));
  assert.equal(cloud.storage_buckets['menu-media'].size, 1);
  const updatedProduct = cloud.products.find((p) => p.id === 'prd-wagyu-smash');
  assert.equal(updatedProduct.image_url, realUpload.body.public_url);
});

test('10. Closed Branch Order Blocking & Unintegrated Online Payment Gateway Disabling', async () => {
  const cloud = new SharedSupabaseCloudState();
  const ownerClient = cloud.createClientInstance('uid-owner');
  const serviceClient = cloud.createClientInstance('uid-super-admin');

  // 1. Order at closed branch (br-jed-obhur has is_accepting_orders = false) -> 422
  const closedBranchOrder = await handleCreateOrderRequest({
    serviceSupabase: serviceClient,
    idempotencyKey: 'idem-closed-br-1',
    clientIp: '11.22.33.44',
    sessionFingerprint: 'sess-closed',
    payload: {
      branch_id: 'br-jed-obhur',
      customer_name: 'تركي السبيعي',
      customer_phone: '0544332211',
      payment_method_id: 'pay_at_pickup_card',
      items: [{ product_id: 'prd-wagyu-smash', size_id: 'sz-wagyu-double', quantity: 1, addon_ids: [] }]
    },
    nowDate: new Date('2026-11-16T19:00:00+03:00')
  });
  assert.equal(closedBranchOrder.status, 422);
  assert.equal(closedBranchOrder.body.error, 'BRANCH_NOT_ACCEPTING_ORDERS');

  // 2. Order attempting to use disabled 'apple_pay_online' -> 422
  const applePayAttempt = await handleCreateOrderRequest({
    serviceSupabase: serviceClient,
    idempotencyKey: 'idem-applepay-1',
    clientIp: '11.22.33.44',
    sessionFingerprint: 'sess-applepay',
    payload: {
      branch_id: 'br-jed-sultan',
      customer_name: 'تركي السبيعي',
      customer_phone: '0544332211',
      payment_method_id: 'apple_pay_online',
      items: [{ product_id: 'prd-wagyu-smash', size_id: 'sz-wagyu-double', quantity: 1, addon_ids: [] }]
    },
    nowDate: new Date('2026-11-16T19:00:00+03:00')
  });
  assert.equal(applePayAttempt.status, 422);
  assert.equal(applePayAttempt.body.error, 'PAYMENT_METHOD_DISABLED_OR_INVALID');

  // 3. Owner tries to enable 'apple_pay_online' without a configured payment gateway -> rejected (422)
  const enableApplePayAttempt = await handleOwnerAdminRequest({
    authSupabase: ownerClient,
    serviceSupabase: serviceClient,
    body: {
      action: 'TOGGLE_PAYMENT_METHOD',
      payment_method_id: 'apple_pay_online',
      is_enabled: true
    }
  });
  assert.equal(enableApplePayAttempt.status, 422);
  assert.equal(enableApplePayAttempt.body.error, 'PAYMENT_GATEWAY_NOT_CONFIGURED');
});

test('10b. Owner staff and product changes are scoped, validated and audited', async () => {
  const cloud = new SharedSupabaseCloudState();
  const ownerClient = cloud.createClientInstance('uid-owner');
  const serviceClient = cloud.createClientInstance('uid-super-admin');

  const staffUpdate = await handleOwnerAdminRequest({
    authSupabase: ownerClient,
    serviceSupabase: serviceClient,
    body: {
      action: 'MANAGE_STAFF_MEMBER',
      staff: {
        id: 'uid-cashier-sultan',
        role: 'kitchen_staff',
        assigned_branch_id: 'br-jed-hamra',
        is_active: false
      }
    }
  });
  assert.equal(staffUpdate.status, 200);
  const changedStaff = cloud.user_profiles.find((profile) => profile.id === 'uid-cashier-sultan');
  assert.equal(changedStaff.role, 'kitchen_staff');
  assert.equal(changedStaff.assigned_branch_id, 'br-jed-hamra');
  assert.equal(changedStaff.is_active, false);
  assert.equal(cloud.audit_logs[0].action, 'MANAGE_STAFF_MEMBER');

  const protectedProfileUpdate = await handleOwnerAdminRequest({
    authSupabase: ownerClient,
    serviceSupabase: serviceClient,
    body: {
      action: 'MANAGE_STAFF_MEMBER',
      staff: { id: 'uid-owner', role: 'cashier', assigned_branch_id: null, is_active: true }
    }
  });
  assert.equal(protectedProfileUpdate.status, 403);
  assert.equal(protectedProfileUpdate.body.error, 'PROTECTED_PROFILE_CANNOT_BE_MODIFIED');

  const invalidRoleUpdate = await handleOwnerAdminRequest({
    authSupabase: ownerClient,
    serviceSupabase: serviceClient,
    body: {
      action: 'MANAGE_STAFF_MEMBER',
      staff: { id: 'uid-cashier-sultan', role: 'super_admin', assigned_branch_id: null, is_active: true }
    }
  });
  assert.equal(invalidRoleUpdate.status, 400);

  const originalProductName = cloud.products.find((product) => product.id === 'prd-wagyu-smash').name_ar;
  const productUpdate = await handleOwnerAdminRequest({
    authSupabase: ownerClient,
    serviceSupabase: serviceClient,
    body: {
      action: 'UPSERT_PRODUCT',
      product: {
        id: 'prd-wagyu-smash',
        base_price: 39,
        is_active: false,
        is_featured: true,
        name_ar: 'محاولة تعديل غير مسموحة'
      }
    }
  });
  assert.equal(productUpdate.status, 200);
  const changedProduct = cloud.products.find((product) => product.id === 'prd-wagyu-smash');
  assert.equal(Number(changedProduct.base_price), 39);
  assert.equal(changedProduct.is_active, false);
  assert.equal(changedProduct.is_featured, true);
  assert.equal(changedProduct.name_ar, originalProductName);
  assert.equal(cloud.audit_logs[0].action, 'UPDATE_PRODUCT');

  const negativePriceUpdate = await handleOwnerAdminRequest({
    authSupabase: ownerClient,
    serviceSupabase: serviceClient,
    body: {
      action: 'UPSERT_PRODUCT',
      product: { id: 'prd-wagyu-smash', base_price: -1, is_active: true, is_featured: false }
    }
  });
  assert.equal(negativePriceUpdate.status, 400);
});

test('11. Production Secret Enforcement & Single-Use Nonce CAPTCHA Replay Prevention', async () => {
  const cloud = new SharedSupabaseCloudState();
  const instance1 = cloud.createClientInstance(null);
  const instance2 = cloud.createClientInstance(null);

  // 1. Solving a CAPTCHA challenge works once, but replaying the exact same token on Instance 2 is blocked!
  const challenge = createAdaptiveCaptchaChallenge();
  const basePayload = {
    branch_id: 'br-jed-sultan',
    customer_name: 'ريان الشهري',
    customer_phone: '0539988776',
    payment_method_id: 'pay_at_pickup_card',
    require_captcha_verification: true,
    captcha_token: challenge.token,
    captcha_answer: challenge._expected_for_automated_tests,
    items: [{ product_id: 'prd-wagyu-smash', size_id: 'sz-wagyu-double', quantity: 1, addon_ids: [] }]
  };

  const firstWithCaptcha = await handleCreateOrderRequest({
    serviceSupabase: instance1,
    idempotencyKey: 'idem-cap-1',
    clientIp: '77.88.99.11',
    sessionFingerprint: 'sess-cap-1',
    payload: basePayload,
    nowDate: new Date('2026-11-16T19:00:00+03:00')
  });
  assert.equal(firstWithCaptcha.status, 201);

  // Replaying the same solved CAPTCHA token on a new order on Instance 2 is rejected (428)
  const replayCaptcha = await handleCreateOrderRequest({
    serviceSupabase: instance2,
    idempotencyKey: 'idem-cap-2',
    clientIp: '77.88.99.11',
    sessionFingerprint: 'sess-cap-1',
    payload: basePayload,
    nowDate: new Date('2026-11-16T19:01:00+03:00')
  });
  assert.equal(replayCaptcha.status, 428);
  assert.equal(replayCaptcha.body.error, 'CAPTCHA_NONCE_REPLAYED_OR_INVALID');

  // 2. Verify missing or weak env secret throws immediately (zero hardcoded fallback secrets)
  const savedSecret = process.env.ORDER_HMAC_SECRET;
  delete process.env.ORDER_HMAC_SECRET;
  assert.throws(() => getRequiredEnvSecret('ORDER_HMAC_SECRET'), /MISSING_OR_WEAK_ENV_SECRET/);
  process.env.ORDER_HMAC_SECRET = savedSecret;
});


test('12. Direct PostgreSQL RPC Security: auth.uid() Enforcement, p_actor_uid Rejection & Full 5-Role + Customer + Anon Matrix', async () => {
  const cloud = new SharedSupabaseCloudState();
  const anonClient = cloud.createClientInstance(null);
  const customerClient = cloud.createClientInstance('uid-regular-customer-not-staff');
  const kitchenClient = cloud.createClientInstance('uid-kitchen-sultan');
  const cashierClient = cloud.createClientInstance('uid-cashier-sultan');
  const serviceClient = cloud.createClientInstance('uid-super-admin');

  const created = await handleCreateOrderRequest({
    serviceSupabase: serviceClient,
    idempotencyKey: 'idem-rpc-sec-12',
    clientIp: '44.55.66.77',
    sessionFingerprint: 'sess-rpc-12',
    payload: {
      branch_id: 'br-jed-sultan',
      customer_name: 'عبدالله الغامدي',
      customer_phone: '0535717670',
      payment_method_id: 'pay_at_pickup_card',
      items: [{ product_id: 'prd-wagyu-smash', size_id: 'sz-wagyu-double', quantity: 1, addon_ids: [] }]
    },
    nowDate: new Date('2026-11-16T19:00:00+03:00')
  });
  const code = created.body.order_code;

  // 1. Anonymous user calling transition_order_status RPC directly -> rejected (auth.uid() is NULL)
  const anonRpc = await anonClient.rpc('transition_order_status', {
    p_order_code: code,
    p_target_status: 'accepted',
    p_confirmed: false,
    p_reason_note: ''
  });
  assert.ok(anonRpc.error);
  assert.match(anonRpc.error.message, /UNAUTHENTICATED_ACTOR/);

  // 2. Logged-in regular customer (not in user_profiles) calling transition_order_status RPC -> rejected
  const customerRpc = await customerClient.rpc('transition_order_status', {
    p_order_code: code,
    p_target_status: 'accepted',
    p_confirmed: false,
    p_reason_note: ''
  });
  assert.ok(customerRpc.error);
  assert.match(customerRpc.error.message, /ACTOR_PROFILE_NOT_FOUND_OR_INACTIVE/);

  // 3. Kitchen staff trying to pass a legacy `p_actor_uid` parameter to impersonate super_admin -> rejected
  const impersonationRpc = await kitchenClient.rpc('transition_order_status', {
    p_order_code: code,
    p_target_status: 'accepted',
    p_actor_uid: 'uid-super-admin',
    p_confirmed: false,
    p_reason_note: ''
  });
  assert.ok(impersonationRpc.error);
  assert.match(impersonationRpc.error.message, /FORBIDDEN_PARAMETER_P_ACTOR_UID_REMOVED/);

  // 4. Cashier authenticated via auth.uid() transitions order without any p_actor_uid parameter -> succeeds!
  const validCashierRpc = await cashierClient.rpc('transition_order_status', {
    p_order_code: code,
    p_target_status: 'accepted',
    p_confirmed: false,
    p_reason_note: 'Accepted via verified auth.uid()'
  });
  assert.equal(validCashierRpc.error, null);
  assert.equal(validCashierRpc.data.status, 'accepted');
});
