# Deployment Readiness — Phase 1 (Vercel production)

**Date:** 24 June 2026 · branch `feat/rail-integration-phase-1`

Phase 1 is **code-complete and green** (lint / tsc / 31 tests / build) but **not yet deployable end-to-end** — go-live is gated on operator deliverables (Silvia) and one rail deploy (KP). This is the go/no-go checklist.

## Go-live blockers (operator-side — cannot be closed by UA eng)

| # | Blocker | Owner | Effect if unmet |
|---|---|---|---|
| 1 | Identiti `unique_accessories_sandbox` HMAC secret (4th in the stale-secret queue) | Silvia | No signup/login/phone-token/step-up. |
| 2 | KP-1-Ops Railway deploy (`PAYMENT_RAIL_API_BASE` TBD) | Silvia / KP | Checkout `initiate` returns 503; no payments. |
| 3 | KP `PAYMENT_RAIL_APP_SECRET` (base64url-43) + corporate `account_uuid` tier_3 | Silvia (tier_3 gated on CHAMIA-ENTITY) | No charges/payouts. |
| 4 | KP Kafka broker creds + topic ACLs | Silvia / KP | No payment confirmations (consumer can't connect). |
| 5 | Todoku tenant + 8 template ULIDs + `TODOKU_APP_SECRET` + `UAKE` sender ID | Silvia (UAKE 2-4wk CA-K) | No order/refund/shipping comms. |
| 6 | Itafika anchor + `ITAFIKA_APP_SECRET` + callback URL on the anchor | Silvia | Webhook 503; no delivery tracking. |
| 7 | Itafika OPS-4 + UA KP `account_uuid` on the anchor | Silvia | KP-16 delivery-fee charging stays inert (reconciliation observe-only). |

## UA-side go-live checklist (we own these)

- [ ] Provision **Vercel KV** (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) — without it webhook dedup falls back to per-instance memory (NOT safe across serverless instances). **Required before taking live payment webhooks.**
- [ ] Set all rail env vars in Vercel (per `.env.example`): Identiti (hex-64), `PAYMENT_RAIL_*` (base64url-43; AD-K06 naming), Todoku (base64url-43 + `TODOKU_TPL_*` ULIDs), Itafika (hex-64), `ITAFIKA_ORIGIN_*` (store geo).
- [ ] Deploy the **KP Kafka consumer** (`scripts/kp-kafka-consumer.ts`) as a **separate long-running worker** (container / Railway) — it is NOT a Vercel function.
- [ ] Run `npm run migrate:sanity -- --apply` once `price_minor` is curated (CHAMIA-CURRENCY) — re-prices the catalog + tags legacy orders.
- [ ] Register the webhook callback URLs with the operator: `/api/webhooks/payment-rail` (when KP ships an HTTP signer), `/api/webhooks/itafika`, `/api/webhooks/identiti` (when ID-14 lands).
- [x] ~~(Functional gap) Add a geocoded **shipping-address step** at checkout~~ — **done.** Checkout now collects a required delivery address + map pin (device GPS or a pasted Google-Maps/`lat,lng` pin), validated against the Kenya service-area box, and persists `order.shipping_destination`. A best-effort delivery-fee estimate (`/api/checkout/delivery-quote`) shows in the cart and degrades to "calculated at dispatch" until Itafika is live; the fee is **not** added to the M-Pesa charge (KP-16 observe-only). Remaining gate is operator-side: set **`ITAFIKA_ORIGIN_LAT`/`_LNG`** (store pickup point) — without it dispatch stays inert and no quote is shown.
- [ ] Smoke each rail once creds land: `npm run smoke:identiti | smoke:payment-rail | smoke:todoku | smoke:itafika`.

## Watch the first 5 orders (per playbook Week 5 Day 5)

Once live, for the first 5 real orders verify end-to-end:
1. Signup/express account → Identiti `account_uuid` issued.
2. Checkout → KP STK push → phone prompt → `PAYMENT_COMPLETED` (Kafka) → order `PAID`.
3. Todoku `order_confirmed` SMS + WhatsApp delivered.
4. (When address step + Itafika anchor live) job created → `job.assigned`→DISPATCHED + shipping SMS → `job.delivered`→DELIVERED + completion SMS.
5. Every step writes a `rail_audit` row with `traceparent` + `business_op_id` (+ `request_id` on outbound calls).

## What is verified now (without operator creds)

Signing (31 unit tests), build/lint/tsc green, all routes resolve, the storefront renders in KES with the M-Pesa checkout UI (browser-verified), and every rail path degrades gracefully (503 / inert-log) when creds are absent — no crashes, no PayPal residue.
