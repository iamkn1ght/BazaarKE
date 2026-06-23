# Itafika Integration — Result (Week 4)

**Branch:** `feat/rail-integration-phase-1` · **Date:** 24 June 2026
**Verification:** `npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run test` ✓ (31/31) · `npm run build` ✓
**Money Rule honored:** `itafika/webhook.ts`, `itafika/handlers.ts` (delivery-fee reconciliation), and `itafika/dispatch.ts` are main-loop only.

Last-mile delivery via the Itafika rail — the asymmetric-HMAC rail.

---

## Done

- `app/lib/rails/itafika/sign.ts` — forked signer (pure, unit-tested): **OUTBOUND base64** over the shared 5-line canonical, **INBOUND hex** over `"<timestamp>.<rawBody>"`. The **bodyless-GET trap is baked in**: a GET signs an empty Content-Type and sends no Content-Type header (signing `application/json` on a GET → 401). Itafika Authorization prefix + lowercase outbound headers (`x-itafika-timestamp`, `x-idempotency-key`).
- `app/lib/rails/itafika/client.ts` — `quoteJob`, `createJob`, `getJob`, `cancelJob` with its own signed fetch (the shared `railFetch` is for the base64-symmetric rails). Secret validated **hex-64**; no separate webhook secret (same secret both directions). `_minor` field names; `anchor_reference_id` second idempotency layer; cancel is POST not DELETE.
- `app/lib/rails/itafika/handlers.ts` (MAIN LOOP) — `dispatchItafikaEvent`: dedups `(job_id, event)` on Vercel KV, correlates `job_id → order` (via stored `itafika_job_id`), patches state (`job.assigned`→DISPATCHED, `job.delivered`→DELIVERED, `job.cancelled`→CANCELLED), logs the **observe-only delivery-fee reconciliation** (KP-16 charging inert until OPS-4 + KP account_uuid on the anchor), and triggers Todoku `shipping_dispatched_sms` / `delivery_completed_sms` (partial-failure safe).
- `app/lib/rails/itafika/webhook.ts` + `app/api/webhooks/itafika/route.ts` (MAIN LOOP) — `runtime='nodejs'`, raw-bytes → constant-time hex verify → JSON.parse, 300s replay; 503 until `ITAFIKA_APP_SECRET` is set. Live once Silvia registers the callback URL on the `unique_accessories` anchor.
- `app/lib/rails/itafika/dispatch.ts` — `dispatchDelivery(externalRef)`: quote → create job → store `itafika_job_id` + `delivery_fee_minor` on the order. Wired into KP `PAYMENT_COMPLETED` (partial-failure safe). **Inert** until a store origin (`ITAFIKA_ORIGIN_*`) and the order's `shipping_destination` geo exist — logs and returns otherwise. Idempotent (skips if `itafika_job_id` already set).
- Sanity `order` schema: added `delivery_fee_minor` (`Rule.integer().min(0)`) + `shipping_destination` (lat/lng/label).
- `scripts/smoke-itafika.ts` (`npm run smoke:itafika`) — quote → create → get, asserts `PENDING_ASSIGNMENT`.
- 5 signer unit tests (base64-out vs hex-in, bodyless-GET empty-CT, inbound tamper/length rejection). Suite now 31.

---

## Blocked / deferred

| Item | Status |
|---|---|
| `unique_accessories` anchor + `ITAFIKA_APP_SECRET` (hex-64) + callback URL registration | Pending Silvia (OPERATOR_REQUEST_ITAFIKA.md). Webhook 503 + client unconfigured until then. |
| KP-16 delivery-fee charging | INERT — needs UA's KP `account_uuid` on the anchor row AND Itafika OPS-4. Reconciliation is observe-only (logged). |
| Itafika OPS-6 (Railway billing) | Blocks rail-side redeploy / prod cutover; does NOT block dev. |
| Actual dispatch on payment | Inert until checkout collects a geocoded `shipping_destination` and `ITAFIKA_ORIGIN_*` is set — **address-collection step is the remaining gap**. |
| Cart delivery-fee quote display | Deferred with the address step (the `quoteJob` capability exists; no geo input yet). |

---

## Notes
- `shipping_dispatched` / `delivery_completed` Todoku sends (left pending in Week 3) are now wired off `job.assigned` / `job.delivered`.
- Distance is computed via haversine from `ITAFIKA_ORIGIN_*` to the order's `shipping_destination`.
