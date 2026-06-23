# Operator Request — Itafika anchor registration for Unique Accessories

**To:** Silvia Mumbua (CTO · Kipkiren Teknolojia · Itafika rail operator)
**From:** Unique Accessories engineering · Chamia Mutuku (CEO · KMV) · authored 23 June 2026
**Authority:** `docs/RAIL_INTEGRATION_PLAYBOOK.md` §3.4 (Itafika per-rail summary) + §2.2 (client location) + §2.4 (HMAC fork) + §2.5 (Money Rule) + §9 (operator-gated blockers #2, #5) · `docs/KMV_RAILS_INTEGRATION_GUIDE.md` §0 (five universal facts) + §10 (pre-flight checklist) · master RECAP §8 (23 Jun 2026, items 1, 2, 5) · canonical wire mirror `C:\Projects\lunch drop\docs\ITAFIKA_INTEGRATION_REFERENCE.md` (rail-side commit `24ac829`, IT-S5)
**Status:** 🟠 BLOCKED on operator action — last of the four UA rail-provisioning asks; fires because CHAMIA-LOGISTICS = Itafika is signed (Week 4), and is sequenced AFTER `OPERATOR_REQUEST_KP.md` because the anchor row needs UA's KP `account_uuid` to make KP-16 delivery-fee charging non-inert.
**Estimated operator effort:** ~30 min (mirrors the `lunchdrop` anchor seed under IT-S5 — same `scripts/seedAnchors.ts`, different row)
**External lead time:** none (no CA-K / regulatory filing on this rail)

---

## 0. Why this / sequencing

CHAMIA-LOGISTICS is signed (23 Jun 2026, recorded in `OPERATOR_REQUEST_CHAMIA.md`): **Itafika confirmed as last-mile.** That un-parks the Week 4 build, so this anchor must exist before Week 4 Day 1.

**Why filed at Week 1 Day 1 anyway (not Week 4 Day 1):** UA's `unique_accessories_sandbox` Identiti HMAC secret is **4th in Silvia's queue** behind 3 stale integrator secrets (`lunchdrop_sandbox` 20d, `itafika_sandbox` 18d, `klokd_sandbox` 14d as of 23 Jun — master RECAP §8 item 1, the platform-wide critical block). Week 4 Itafika work assumes at least one of those delivery cascades clears by Week 2. File now so the anchor seed is queued, not blocking on the day the build starts.

**Sequencing dependency on KP:** this request depends on `OPERATOR_REQUEST_KP.md` because Itafika charges UA's KP account internally on `job.delivered` (KP-16, anchor → Itafika). The anchor row needs UA's KP `account_uuid` recorded on it (see §1 + §6). UA's KP `account_uuid` is itself gated on CHAMIA-ENTITY (legal-entity registration date for the KP `tier_3` corporate account — still TBD per `OPERATOR_REQUEST_CHAMIA.md` §3). The anchor can be seeded and dispatch/quote work can begin **before** the `account_uuid` lands; only the delivery-fee charging stays inert until it does (§7).

**What this request does NOT block:** UA dev work against the currently-deployed Itafika dev image. Dispatch create / quote / get / cancel + HMAC auth + idempotency are live + smoke-verified on dev (22 Jun, per the IT-S5 mirror). OPS-6 (Itafika Railway billing, trial expired) blocks rail-side **redeploy / production cutover** but does NOT block UA's client work against the deployed dev image (master RECAP §8 item 2).

---

## 1. The ask — sandbox anchor registration

Seed a `unique_accessories` anchor on Itafika's live Supabase (`status = active`), same shape as the `lunchdrop` anchor under IT-S5. `POST /v1/anchors` is operator-only (admin token) — UA never calls it; UA only consumes the issued creds. Concretely, please:

1. Seed anchor `unique_accessories` via `scripts/seedAnchors.ts` → returns `anchor_id` (UUID).
2. Issue `ITAFIKA_APP_SECRET` (hex-64) once and deliver out-of-band via 1Password (item `KMV / Itafika / unique_accessories HMAC`). Never committed to the UA repo.
3. Record UA's KP `account_uuid` on the anchor row (the KP-16 payer link — see §6 + §7; supplied via `OPERATOR_REQUEST_KP.md`).
4. Register UA's production `webhook_callback_url` on the anchor row (see §6; until set, no webhooks are delivered — UA can still create + poll jobs).

**App identity:**

| Field | Value |
|---|---|
| `app_slug` | `unique_accessories` |
| `app_name` | Unique Accessories |
| `legal_entity` | Unique Accessories Ltd (name confirmed; Companies Registry registration date **TBD — CHAMIA-ENTITY**; gates the KP `tier_3` corporate `account_uuid` that lands on this anchor row, NOT the anchor seed itself) |
| `vertical` | e-commerce / physical-goods retail (last-mile parcel delivery, warehouse → customer) |
| `audience_posture` | B2C (consumers receive deliveries; UA is the anchor/payer) |
| `regulator_exposure` | DPA 2019 (customer delivery addresses; geo handled at the order boundary, never sent to Hakken) — no CBK / CA-K exposure on this rail |
| `sandbox_mode` | true |
| `anchor_id` | TBD — issued by operator at seed (UUID) |
| `kp_account_uuid` (anchor row) | TBD — KP `tier_3` corporate `account_uuid`, gated on **CHAMIA-ENTITY**; supplied via `OPERATOR_REQUEST_KP.md` |
| `webhook_callback_url` (anchor row) | `https://<ua-prod-host>/api/rails/itafika/webhook` (see §6) |

---

## 2. Env vars (3 — NOT 4)

Set in UA's deploy env (Vercel) once the rail-side seed completes. **There is no `ITAFIKA_WEBHOOK_SECRET`** — Itafika signs outbound webhooks with the **same** `ITAFIKA_APP_SECRET`; UA verifies inbound webhooks with that one secret. One secret, both directions (per Silvia's IT-S5 handover + the IT-S5 mirror §1).

| Env var | Value | Notes |
|---|---|---|
| `ITAFIKA_BASE_URL` | `https://itafika-production.up.railway.app` | Deployed dev image, live + smoke-verified 22 Jun. Railway URL — no custom domain cut over. Validate with `curl https://itafika-production.up.railway.app/v1/health` → 200 before writing the client (KMV guide §1 URL trap). |
| `ITAFIKA_APP_ID` | `unique_accessories` | Mirrors the anchor slug seeded in `scripts/seedAnchors.ts`. Sent inside the `Authorization` header (`app_id=unique_accessories`) — NOT a separate header. |
| `ITAFIKA_APP_SECRET` | **hex-64** (64 hex chars) | **Encoding is hex-64**, per Silvia's IT-S5 handover — NOT base64url like Todoku/KP. Used as the key for BOTH directions (outbound base64-output signing AND inbound hex-output verification). Delivered out-of-band via 1Password (`KMV / Itafika / unique_accessories HMAC`). UA's env loader rejects non-hex-64 at boot (`RAIL_CONFIG_INCOMPLETE: itafika`). |
| ~~`ITAFIKA_WEBHOOK_SECRET`~~ | **DEFERRED** | **Does not exist for this rail.** Inbound webhooks are verified with the same `ITAFIKA_APP_SECRET`. Do NOT issue a separate webhook secret — there is no fourth var. |

---

## 3. Granted scopes

Not applicable. Itafika has **no granular scope model** for anchors — access is gated by anchor status (`active` / `suspended`) and RLS (a `GET /v1/jobs/{id}` only returns jobs owned by your anchor). There is no scope list to grant. The only operator-side gates that matter are (a) anchor `status = active` and (b) the KP `account_uuid` on the anchor row for KP-16 (§7). `403 ANCHOR_NOT_ACTIVE` / `ANCHOR_SUSPENDED` is the failure mode if the anchor is not active.

---

## 4. Authentication — per-request HMAC (ASYMMETRIC: base64 out / hex in)

Itafika is **the only rail that forks** the shared `signRequest()` helper (playbook §2.4). One shared secret (`ITAFIKA_APP_SECRET`), but the two directions use **different signature encodings and different canonical strings**. Client file: **`app/lib/rails/itafika/client.ts`**; signer fork: **`app/lib/rails/itafika/sign.ts`** (this is the only place that diverges from `app/lib/rails/_shared/signRequest.ts`). Both declare `export const runtime = 'nodejs'` at the consuming route (Edge can't `crypto.createHmac`).

### 4.1 Outbound (Unique Accessories → Itafika) — base64 signature output

The canonical signing string is the rail-wide 5-line string (KMV guide §0 fact 2): `METHOD`, `PATH_AND_QUERY`, `CONTENT_TYPE`, `TIMESTAMP`, `SHA256_HEX(rawBody)` joined by `\n`. The **outer** signature is **base64**; the body hash **inside** the canonical is **hex**. Sign the path **with** the `/v1/` prefix.

Authorization header (bodied request example):

```
Authorization: Itafika-HMAC-SHA256 app_id=unique_accessories, signature=<base64>
x-itafika-timestamp: 2026-06-23T09:14:07.000Z
x-idempotency-key: 3f1c2b8e-7a4d-4e2a-9c11-1b6d0a2f9e55
content-type: application/json; charset=utf-8
```

Canonical signing string (bodied POST — exactly what is HMAC'd):

```
POST
/v1/jobs
application/json; charset=utf-8
2026-06-23T09:14:07.000Z
<SHA256_HEX(rawBody)>
```

- `signature = base64( HMAC-SHA256( canonical, ITAFIKA_APP_SECRET ) )`.
- `CONTENT_TYPE` line = the **actual** value sent: `application/json; charset=utf-8` for bodied requests, **empty string** for a bodyless GET.
- `PATH_AND_QUERY` includes the query string if present.
- Hash the **raw bytes** you send; do not re-serialise after hashing.
- **Replay window: 300 s** (RFC 3339 timestamp). `X-Idempotency-Key` is **UUIDv4 on every write (POST/PATCH/DELETE)**, persisted 24 h rail-side.

⚠ **Bodyless-GET trap (bake in from day 1):** on `GET /v1/jobs/{job_id}`, sign **EMPTY** Content-Type in the canonical (the `CONTENT_TYPE` line is the empty string) AND send **NO** Content-Type header on the wire. Signing the literal `application/json` on a GET returns **401**. This bit the Identiti integration — `sign.ts` must special-case GET, not reuse a bodied constant.

### 4.2 Inbound (Itafika → Unique Accessories) — hex signature output

Webhook receiver: **`app/lib/rails/itafika/webhook.ts`** — **MAIN LOOP authoring per Money Rule** (playbook §2.5; this is where `job.delivered` triggers delivery-fee reconciliation). Route handler at `app/api/rails/itafika/webhook/route.ts` reads raw bytes via `await req.text()` **before** verify.

Inbound headers:

```
X-Itafika-Event: job.delivered
X-Itafika-Timestamp: 2026-06-23T09:20:11.000Z
X-Itafika-Signature: <hex HMAC-SHA-256>
Content-Type: application/json
```

Inbound canonical (dot-delimited, NOT the 5-line outbound canonical):

```
<X-Itafika-Timestamp>.<rawBody>
```

- `signature = hex( HMAC-SHA256( "<timestamp>.<rawBody>", ITAFIKA_APP_SECRET ) )`.
- Verify over **raw bytes, constant-time, BEFORE `JSON.parse`** (`req.json()` parses before verify and defeats the compare).
- **Replay window: ~300 s.** Delivery is **at-least-once** with retry/backoff → **dedupe on `(job_id, event)`** (use Vercel KV / Upstash, NOT Sanity — playbook §4.6). Ack with `2xx` quickly.

---

## 5. Endpoints this app will call

All under `ITAFIKA_BASE_URL`, HMAC-signed per §4.1. Responses use the standard envelope `{ ok, data, meta }` (success) / `{ ok:false, error:{code,message,field?}, meta }` (error) — unwrap to `data` at the client boundary; depend on `error.code`, not `message`.

| Method | Path | Purpose | Notes / traps |
|---|---|---|---|
| POST | `/v1/jobs/quote` | Price a delivery, no create | Body: `origin {lat,lng,label}`, `destination {lat,lng,label}`, `distance_meters` (integer), `tier`. Returns `price_minor`, `rider_payout_minor`, `move_take_minor`, `distance_meters`, `tier`. Use to show delivery fee at checkout. |
| POST | `/v1/jobs` | Create a dispatch (idempotent) | Body includes `anchor_reference_id: "ua_order_<id>"` — the **2nd idempotency layer**. Returns `job_id`, `state: "PENDING_ASSIGNMENT"`, `price_minor`, `rider_payout_minor`. Fired after KP `PAYMENT_COMPLETED`. |
| GET | `/v1/jobs/{job_id}` | Fetch current state (RLS-scoped to your anchor) | ⚠ **Bodyless-GET trap (§4.1):** empty Content-Type signed, no Content-Type header sent → else 401. |
| POST | `/v1/jobs/{job_id}/cancel` | Cancel a job | ⚠ **POST, not DELETE.** ⚠ **pre-DELIVERED only** — cancelling a DELIVERED job returns `422 JOB_ILLEGAL_TRANSITION`. |

⚠ **Money field names use the `_minor` suffix, NOT `_kes_minor`.** The Itafika wire fields are **`price_minor`**, **`rider_payout_minor`**, **`move_take_minor`** (KES integer minor units). This differs from KP's wire field (`amount_minor`) and from the Sanity schema field (`total_minor`). Do not send or expect `*_kes_minor` on Itafika calls.

⚠ **`anchor_reference_id` = `"ua_order_<id>"`** — set it to UA's order id. Re-creating with the same `anchor_reference_id` returns the existing job, so safe retry needs no UUID coordination beyond the per-request `x-idempotency-key`.

Error codes UA will branch on: `401 AUTH_HMAC_INVALID`, `401 AUTH_TIMESTAMP_EXPIRED`, `403 ANCHOR_NOT_ACTIVE`/`ANCHOR_SUSPENDED`, `400 REQ_INVALID` (`field` names the offender), `400 REQ_IDEMPOTENCY_KEY_MISSING`, `409 REQ_IDEMPOTENCY_KEY_CONFLICT`, `404 JOB_NOT_FOUND` (unknown or not owned by your anchor — RLS), `422 JOB_ILLEGAL_TRANSITION`.

---

## 6. Webhook events / async delivery

Itafika POSTs HMAC-signed (hex, §4.2) webhooks to UA's registered `webhook_callback_url` on these **5 anchor transitions** (body `{ "event", "job_id", "state" }`):

| event | state | UA action |
|---|---|---|
| `job.assigned` | ASSIGNED | rider matched — notify customer via Todoku (`shipping_dispatched_sms`) |
| `job.picked_up` | AT_PICKUP | rider at warehouse — log audit (`rail_audit` row) |
| `job.delivered` | DELIVERED | patch Sanity order → `DELIVERED`; **commit delivery-fee reconciliation** (observe-only at MVP — see §7); fire Todoku `delivery_completed_sms` + optional review request |
| `job.failed` | FAILED | rider couldn't deliver — surface to customer |
| `job.cancelled` | CANCELLED | cancellation — patch order, surface to customer |

`IN_TRANSIT`, `AT_DROPOFF`, and `SETTLED` do **NOT** emit anchor webhooks — poll `GET /v1/jobs/{job_id}` if those are needed. `job.created` goes to Itafika's Kafka stream, not to UA.

**Provide to the operator (records on the anchor row):**

1. **`webhook_callback_url`** = `https://<ua-prod-host>/api/rails/itafika/webhook`. **TBD — UA Vercel production host** (final origin assigned at first Vercel production deploy, Week 5 Day 5 per playbook §7). Until set on the anchor row, no webhooks are delivered (UA can still create + poll jobs).
2. **UA's KP `account_uuid`** = the KP `tier_3` corporate account Itafika charges via KP-16. **TBD — CHAMIA-ENTITY** (gates the KP corporate `account_uuid`; supplied via `OPERATOR_REQUEST_KP.md`).

---

## 7. Sandbox quirks

⚠ **KP-16 delivery-fee charging stays INERT** until **BOTH** of these land:
- (a) UA's KP `account_uuid` is recorded on the `unique_accessories` anchor row (gated on **CHAMIA-ENTITY** → `OPERATOR_REQUEST_KP.md`), **AND**
- (b) Itafika **OPS-4** lands (KP `itafika_sandbox` creds — master RECAP §8 item 5).

Until both are true, the `job.delivered` webhook fires successfully but **no KES moves**. **Delivery-fee reconciliation is observe-only at MVP:** on `job.delivered`, UA logs the expected fee (from the original `/v1/jobs/quote` / create `price_minor`) and watches for the eventual KP statement entry once OPS-4 + the `account_uuid` land. UA writes NO KP-16 charge code for delivery fees — Itafika charges internally (anchor → Itafika); UA's only KP coupling is being the payer.

- **OPS-6 (Itafika Railway billing, trial expired):** blocks rail-side **redeploy / production cutover** but does NOT block UA dev work against the currently-deployed dev image. Webhook delivery + settlement behaviour reflect the deployed dev image; the latest worker/notification behaviour lands on the next Itafika redeploy (master RECAP §8 item 2 / IT-S5 mirror §9).
- **Region anomaly (awareness only):** Itafika's Supabase is in `eu-west-2` (London), not the locked `eu-west-1` (Reboot Pack v1.3 §13.4). Silvia is resolving before Stage 2. No functional impact on UA's integration.
- **Smoke parity:** UA's `scripts/smoke-itafika.ts` mirrors the proven dev recipe — base64-HMAC-signed `POST /v1/jobs` → expect `201`, `data.state == "PENDING_ASSIGNMENT"` (IT-S5 mirror §8).

---

## 8. App-side commitments (informational)

| Item | Owner | Status |
|---|---|---|
| `app/lib/rails/itafika/client.ts` (outbound: quote / create / get / cancel) | UA Week 4 Day 1–2 | Sub-agent-authorable (non-payment outbound per Money Rule) — code-ready after anchor seed lands |
| `app/lib/rails/itafika/sign.ts` (asymmetric base64-out fork + bodyless-GET empty-Content-Type carve-out) | UA Week 4 Day 1 | ⚠ Bodyless-GET special-case is a Day-1 unit test (signs empty CT, sends no CT header) |
| `app/lib/rails/itafika/webhook.ts` (inbound: hex verify, MAIN LOOP) | UA Week 4 Day 3 | Hand-written in main loop per Money Rule — payment-adjacent (`job.delivered` reconciliation). No sub-agents on this file. |
| Outbound base64 signature output (not hex) | UA itafika client | ✅ Built per `signRequest()` fork at scaffold |
| Inbound hex signature verify over `"<timestamp>.<rawBody>"`, constant-time, before `JSON.parse` | UA itafika webhook | ✅ Pattern locked (playbook §2.2 raw-body rule) |
| Replay window 300 s + dedupe on `(job_id, event)` via Vercel KV / Upstash (NOT Sanity) | UA itafika webhook | ✅ Per playbook §4.6 — Sanity is unsafe as dedup store |
| `x-idempotency-key` UUIDv4 on every write | UA itafika client | ✅ Built at scaffold |
| `anchor_reference_id = "ua_order_<id>"` as 2nd idempotency layer | UA itafika client | ✅ Built at scaffold |
| KES integer **minor units** only; `_minor` (NOT `_kes_minor`) on Itafika wire | UA itafika types | ✅ Field names locked in `types.ts` |
| `export const runtime = 'nodejs'` on every route importing the client/webhook | UA route handlers | ✅ Edge can't `crypto.createHmac` |
| §A.11 audit propagation: `traceparent` + `business_op_id` (= order_id / itafika `job_id`) + `request_id` (from `meta.request_id`) on every `rail_audit` row | UA order schema | ✅ Per playbook §2.6 + §4.3 |
| Anchor registration (`POST /v1/anchors`), rider management / KYC / payouts, KP-16 delivery-fee charge code | NOT UA | ✅ All rail-internal / operator-only — UA does not implement |

---

## 9. Cross-reference

- `docs/RAIL_INTEGRATION_PLAYBOOK.md` — §3.4 (Itafika per-rail summary, wire contract, INERT KP-16), §2.2 (client location `app/lib/rails/itafika/`), §2.4 (the Itafika HMAC fork), §2.5 (Money Rule: webhook = MAIN LOOP), §4.6 (Vercel KV dedup), §7 Week 4 (build plan), §9 (operator-gated blockers #2 OPS-6, #5 OPS-4)
- `docs/KMV_RAILS_INTEGRATION_GUIDE.md` — §0 (five universal facts: base64 outer sig, hex body hash, `/v1/` in canonical, `{ok,data,meta}` envelope, UUIDv4 idempotency), §10 (operator-request pre-flight checklist)
- master RECAP §8 (23 Jun 2026) — item 1 (3 stale Identiti HMAC secrets; UA is 4th in queue), item 2 (Itafika OPS-6 Railway billing), item 5 (OPS-4 KP `itafika_sandbox` creds → gates KP-16 charging)
- `OPERATOR_REQUEST_CHAMIA.md` — CHAMIA-LOGISTICS signed (Itafika confirmed, Week 4 fires); CHAMIA-ENTITY (registration date TBD → gates KP `account_uuid` on the anchor row)
- `OPERATOR_REQUEST_KP.md` — supplies UA's KP `tier_3` corporate `account_uuid` (the KP-16 payer link recorded on the Itafika anchor row); **this request depends on it**
- Sibling precedents in `C:\Projects\`: `C:\Projects\lunch drop\docs\ITAFIKA_INTEGRATION_REFERENCE.md` (IT-S5, the canonical secret-free wire mirror — `lunchdrop` anchor, rail-side commit `24ac829`); rail-side `C:\Projects\itafika\docs\INTEGRATOR_HANDOVER_LUNCHDROP.md` + `docs/WEBHOOKS.md` (verification recipe) + `openapi.yaml` (machine-readable surface); `C:\Projects\Klokd\OPERATOR_REQUEST_KP.md` (house-style precedent)

---

*Operator Request 4/4 · Itafika anchor registration for Unique Accessories · 23 June 2026 · Confidential · Week 4 blocker (KP-16 charging inert until anchor `account_uuid` + OPS-4 land) · Depends-on: OPERATOR_REQUEST_KP.md*
