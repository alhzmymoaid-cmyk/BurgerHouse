# Pickappo delivery integration plan

Status: design only. No production API credentials, partner approval, branch references, or delivery SLA confirmation have been received. Do not enable customer delivery or dispatch live orders until the acceptance checks below pass.

## Decision

Use Pickappo as the first delivery aggregator candidate for BurgerHouse's Jeddah pilot. Its published Integration API supports delivery-order creation, partner/brand/branch references, and real-time order-status webhooks. This fits BurgerHouse's multi-restaurant / multi-branch model better than hard-wiring a single courier.

Provider documentation:
- https://docs.pickappo.com/
- https://docs.pickappo.com/integration-steps
- https://docs.pickappo.com/orders
- https://docs.pickappo.com/webhooks
- https://docs.pickappo.com/authentication

## Confirm with Pickappo before coding live dispatch

Request an **integration-interface / platform partner** account (not a single restaurant merchant account), and written confirmation of:
1. Jeddah coverage by district and operating hours, including actual on-demand restaurant courier availability.
2. Whether each BurgerHouse tenant can be registered as a separate brand and each restaurant location as a branch under one BurgerHouse partner reference.
3. The commercial model: onboarding/integration fees, per-order fees, minimums, cancellation/waiting charges, COD settlement, VAT invoices, and who pays the courier.
4. A realistic pickup/arrival SLA and whether a sub-60-minute order-to-door target is achievable by zone and time of day. Do not advertise a guaranteed 60-minute delivery without a contractual SLA.
5. API access for staging and production, partner_reference, x-api-token, x-api-secret, webhook registration/authentication or signature mechanism, rate limits, retries, and support escalation.
6. How to quote delivery price and ETA before checkout, and whether quote/availability endpoints are available.

## Existing BurgerHouse constraints discovered

- Orders currently have `fulfillment_type` constrained to `pickup` only.
- The order creation RPC is named `create_verified_pickup_order`; it currently accepts branch, customer, payment, items and coupon inputs, but no delivery address/coordinates.
- `orders` already has `branch_id`, `branch_snapshot`, customer details, totals, status timestamps and order number.
- `branches` has pickup address, latitude/longitude and preparation-time fields.
- No delivery dispatch, provider credential, destination-location, courier, or delivery-event tables were found in the inspected public schema.

Therefore delivery is **not** a UI-only change. The database constraints and atomic order-creation path must be extended before a delivery order can be accepted safely.

## Target customer and restaurant flow

1. Customer selects **home delivery** at checkout and pins the exact destination on the map.
2. Server calculates/validates the delivery quote and ETA for that branch and destination. The UI must not claim service outside the provider's confirmed zone.
3. Customer confirms the order. The atomic order transaction saves the order as delivery-pending, with immutable destination snapshot, quote, and idempotency key.
4. Restaurant receives the new order and accepts it. BurgerHouse then automatically creates a scheduled/ASAP delivery request using the branch reference and customer coordinates. Use the restaurant's prep-time estimate to reduce courier waiting; provider scheduling semantics must be confirmed in staging.
5. Provider webhooks update dispatch/courier status. Persist events idempotently and reject unauthenticated or stale updates.
6. Customer sees order preparation and courier progress separately, including the latest provider tracking URL when available.
7. Cancellation, courier reassignment, no-courier-found, failed delivery, returned order, and refund/payment reconciliation each have explicit states and staff actions.

## Proposed data model (migration design; not applied)

- Extend `orders.fulfillment_type` to allow `pickup` and `delivery`.
- Add delivery destination snapshot fields to orders (recipient/address, lat/lng, delivery fee, quoted ETA, customer delivery notes); do not overwrite the branch pickup address.
- Add a provider integration settings table scoped to the BurgerHouse platform / tenant as appropriate. Encrypt credentials at rest or store them only as deployment secrets if one global partner account is used. Never expose provider secrets to browser clients.
- Add per-branch provider mapping (Pickappo `branch_reference`) and per-brand mapping. Do not derive provider IDs from user input.
- Add a `delivery_dispatches` table linked to one order, storing provider, provider order ID, stable external ID, dispatch state, courier details, latest tracking URL, quote, timestamps, and safe error codes.
- Add an append-only `delivery_events` table with a unique provider-event key (or deterministic order+event+occurred_at key) to deduplicate webhook retries and preserve an audit trail.
- Enable RLS on exposed tables. Staff access must be limited to their assigned branch; owners to their own restaurant tenant; platform admins only through explicit privileged server routes. Provider credentials must never be selectable by customer/staff frontend roles.

## Server integration components

- Provider adapter: `src/lib/delivery/providers/pickappo.ts` with typed request/response mapping and timeouts.
- Credential access: server-only environment variables or encrypted server-side secret storage; stage and production credentials separate.
- Quote/coverage endpoint: server validates branch, destination coordinates, distance/zone, quote and ETA. If Pickappo has no quote endpoint, request a documented pricing method rather than inventing a fee.
- Dispatch endpoint: authenticated staff/restaurant event triggers a single idempotent dispatch after order acceptance. Never dispatch directly from a browser.
- Webhook endpoint: verify the provider's agreed authentication/signature before parsing events; persist event first, process state transition idempotently, return quickly, and queue/retry downstream work.
- Tracking endpoint: return only the order's safe delivery status, courier fields approved for customer display, and latest tracking URL.
- Observability: structured logs with order ID/provider event ID; never log API secrets, full payment data, or unnecessary customer PII.

## Important timing rule

The goal is delivery within 60 minutes of order creation, not a promise. Compute the estimate as preparation + courier assignment/pickup + travel, using provider estimates and real historical data. If the quote exceeds the target or no courier is available, show the honest ETA or disable delivery for that branch/zone. Never silently accept an order with an unfulfillable ETA.

## Staged implementation and acceptance

1. **Partner onboarding:** receive stage credentials, partner_reference, and approval for a platform account; confirm Jeddah zones and commercial terms.
2. **Schema/RPC:** add delivery fields, constraints, dispatch/event tables, branch mapping, RLS, and update the atomic order RPC. Test pickup regression and delivery idempotency.
3. **Provider adapter:** create staging order, retrieve it, cancel it, handle provider errors/timeouts, and prove duplicate requests do not create duplicate couriers.
4. **Webhook:** verify authentication, duplicate/out-of-order event handling, retries, and status mapping.
5. **UI:** add delivery choice, map pin/address, quote/ETA, delivery fee, customer tracking, and branch-level enable/disable settings.
6. **End-to-end Jeddah pilot:** run real test orders across multiple districts and peak/off-peak periods. Measure order-created-to-door time, courier assignment latency, cancellation rate, and actual fee.
7. **Launch gate:** enable only after written provider coverage/SLA, security review, successful staging and live pilot, and support/cancellation/refund procedures.

## Environment variable names (placeholders only)

- `PICKAPPO_BASE_URL` (stage or production)
- `PICKAPPO_API_TOKEN`
- `PICKAPPO_API_SECRET`
- `PICKAPPO_PARTNER_REFERENCE`
- `PICKAPPO_WEBHOOK_SECRET` (only if Pickappo provides a webhook signing secret for this integration type)

Do not commit actual credentials or ask the user to paste secrets into chat. Add them through Vercel/Supabase secret settings once issued.
