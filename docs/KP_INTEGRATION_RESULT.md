# Kipkiren Pay Integration — Result (Week 2)

**Branch:** `feat/rail-integration-phase-1` · **Date:** 23–24 June 2026
**Verification:** `npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run test` ✓ (23/23) · `npm run build` ✓
**Money Rule honored:** money.ts, webhook.ts, handlers.ts (capture confirmation + refund/payout state), checkout/initiate, and the Kafka consumer were all authored in the main loop — no sub-agents on money paths.

Replaces PayPal checkout (removed Week 1) with the Kipkiren Pay rail. KES integer minor units end to end.

---

## Done

### Outbound client + money
- `app/lib/rails/payment-rail/money.ts` — `kesMajorToMinor`, `kesMinorToMajor`, `formatKes`, `parseAmountMinor` (KP responses encode `amount_minor` as a string bigint), `requiresStepUp` (KES 10,000 = 1,000,000 minor). Integer-only; throws on non-integer money.
- `app/lib/rails/payment-rail/client.ts` — `initiateCharge`, `getCharge`, `initiatePayout`, `getPayout`, `createHold` via the shared signer (prefix `KipkirenPay`). `PAYMENT_RAIL_APP_SECRET` validated as **base64url-43**. Payouts at `/v1/payouts/initiate` (bare `/v1/payouts` 404s). Field `amount_minor`.
- `app/lib/rails/payment-rail/types.ts` — charge/payout/hold/event envelopes.

### Webhook — Kafka primary, HTTP inert (Money Rule)
- `app/lib/rails/_shared/dedup.ts` — atomic set-if-absent dedup on **Vercel KV** (NOT Sanity — eventual consistency would double-process). Dev in-memory fallback (warns in prod). Key `dedup:<rail>:<event_type>:<id>`, TTL 600s.
- `app/lib/rails/payment-rail/handlers.ts` — `dispatchKpEvent` (dedup → patch Sanity order): `PAYMENT_COMPLETED` → `PAID` + `kp_charge_id` + audit row (TODO triggers: Itafika dispatch Week 4, Todoku confirm Week 3); `PAYMENT_FAILED` → `FAILED`; `PAYOUT_COMPLETED` → `REFUNDED`; `WALLET_CREDITED`/`PAYOUT_FAILED` → audit. Shared by both webhook + Kafka paths.
- `app/lib/rails/payment-rail/kafka-consumer.ts` + `scripts/kp-kafka-consumer.ts` — kafkajs consumer (PRIMARY) on `kp.wallet/payment/payout.events`; runs as a **separate worker** (not a Vercel function). Kafka offset is the dedup primitive.
- `app/lib/rails/payment-rail/webhook.ts` + `app/api/webhooks/payment-rail/route.ts` — SECONDARY HTTP receiver, **inert (503)** until KP ships an HTTP signer; `runtime='nodejs'`, raw-bytes → constant-time base64 verify → JSON.parse, 300s replay.

### Checkout (Money Rule)
- `app/api/checkout/initiate/route.ts` — `runtime='nodejs'`. Resolves the buyer (session, or **anonymous express**: creates a tier-0 Identiti customer from phone+name on the fly + sets session). **Recomputes the total from Sanity `price_minor`** (never trusts client amounts), creates the order (`order.ua_order_<uuid>`, state `PENDING`, `traceparent`, `business_op_id`), calls KP `initiateCharge`, records `kp_charge_id` + audit row. KP-not-deployed → 503.
- `app/api/checkout/status/route.ts` — `runtime='nodejs'`, read-only poll of `getCharge` (the durable `PAID` transition is owned by the webhook/Kafka path).
- `app/lib/rails/_shared/trace.ts` — W3C `traceparent` generator (§A.11).

### UI + KES money correctness
- `app/components/KipkirenPayCheckout.tsx` — replaces the cart placeholder. M-Pesa phone + name, "Check your phone for the M-Pesa prompt", 90s countdown, 3s polling, retry on fail; on `COMPLETED`/`PAID` clears cart → `/success`.
- Cart now carries **KES minor units**: `AddToBag` takes `priceMinor`; product page + cart modal + Newest/all/category render `formatKes(...)` (no more `$`); product JSON-LD is `priceCurrency: KES`. `interface.ts` gained `price_minor`.

### Tests
- `app/lib/rails/payment-rail/money.test.ts` — 9 `node:test` cases (conversions, formatting, string-parse, step-up threshold, non-integer rejection). Total suite now 23.
- `scripts/smoke-payment-rail.ts` (`npm run smoke:payment-rail`) — mirrors the smoke recipe; asserts charge CREATED (the 254708374149 → ResultCode 1037 sandbox quirk means COMPLETED needs KP-synthesized callbacks).

---

## Blocked / deferred (not Week-2 failures)

| Item | Status |
|---|---|
| KP not deployed (KP-1-Ops) | `PAYMENT_RAIL_API_BASE` TBD; `initiateCharge`/smoke return 503/can't run end-to-end until it lands. |
| KP HTTP webhook signer | Does not exist — `PAYMENT_RAIL_WEBHOOK_SECRET` unfillable; HTTP receiver stays inert; Kafka is the live path. |
| KP Kafka broker creds + topic ACLs | Pending (OPERATOR_REQUEST_KP.md) — consumer can't connect yet. |
| `PAYMENT_RAIL_APP_SECRET` (base64url-43) + corporate `account_uuid` tier_3 | Pending Silvia; tier_3 gated on CHAMIA-ENTITY. |
| Vercel KV | Not provisioned — dedup uses the dev in-memory fallback until `KV_REST_API_URL`/`_TOKEN` are set (provision before production). |
| Itafika dispatch + Todoku confirm on PAYMENT_COMPLETED | TODO stubs — Week 4 / Week 3. |
| Refund/payout UI | `initiatePayout` client exists; an admin refund flow is not yet built (operator-initiated for now). |

---

## Tech debt / notes
- Cart entries store `price` = `price_minor`; until `scripts/migrate-sanity-paypal-to-kp.ts --apply` runs, products fall back to `price*100` for display/checkout. Run the migration once `price_minor` is curated.
- README "Checkout flow" section still describes PayPal — rewrite for the KP STK-push flow before launch.
- The Kafka consumer must be deployed as a standalone worker (container/Railway), separate from the Vercel app.
