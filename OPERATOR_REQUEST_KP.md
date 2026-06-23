**To:** Silvia Mumbua (CTO · Kipkiren Teknolojia · Kipkiren Pay rail operator)
**From:** Unique Accessories engineering · Chamia Mutuku (CEO · KMV) · authored 23 June 2026
**Authority:** cite docs/RAIL_INTEGRATION_PLAYBOOK.md §2.3, §3.2, §4.2 + docs/KMV_RAILS_INTEGRATION_GUIDE.md §0–§2, §6 + master RECAP §8 (23 Jun 2026, items 1 / 10)
**Status:** 🟠 BLOCKED on operator action — provision the sandbox app + secret behind the Identiti `account_uuid` (this file Depends-on OPERATOR_REQUEST_IDENTITI.md); the corporate `tier_3` account itself is GATED on CHAMIA-ENTITY (legal-entity registration date still TBD).
**Estimated operator effort:** ~30 min (app + secret) once Identiti `account_uuid` exists; the `tier_3` corporate account is a separate step gated on entity registration.
**External lead time:** none for sandbox app/secret; regulatory weeks for `tier_3` corporate (CBK production timeline 3–9 months per RECAP, and Companies Registry lead time on "Unique Accessories Ltd").

---

## 0. Why this / sequencing (dependency rationale)

Unique Accessories replaces PayPal with Kipkiren Pay (KP) per the Cardinal Rule — apps never call third-party payment providers directly (playbook §2.1; KMV guide §8). This is **Operator Request 2 of 4** (Identiti → KP → Todoku → Itafika).

Sequencing constraints:

1. **KP depends on Identiti first.** Every KP charge and payout carries an `account_uuid` minted by Identiti (playbook §3.2; KMV guide §1 "Per app" — *Account UUID prefix … Primary FK on every … table*). Provision `unique_accessories_sandbox` on Identiti before (or alongside) this so the KP corporate account can be linked. **Depends-on: OPERATOR_REQUEST_IDENTITI.md.**
2. **Filed Week 1 Day 1 because of the stale-secret queue.** Master RECAP §8 item 1 (platform-wide blocker): 3 stale Identiti integrator HMAC secrets already sit at operator (`lunchdrop_sandbox` 20d, `itafika_sandbox` 18d, `klokd_sandbox` 14d as of 23 Jun). UA's `unique_accessories_sandbox` secret is **4th in that queue** — every day this is unfiled pushes UA further back. That is the entire reason these four requests land on Day 1.
3. **KP is not deployed.** `PAYMENT_RAIL_API_BASE` cannot be filled today — `pay.kipkiren.co.ke` does not resolve and the KP-1-Ops Railway deploy is still outstanding (master RECAP §8 item 10; KMV guide §1 + §6 "PENDING DEPLOY"). We can wire and unit-test the client against the contract now; smoke is blocked on the deployed URL.
4. **`tier_3` corporate is entity-gated.** A KP corporate `account_uuid` at `tier_3` requires the legal entity "Unique Accessories Ltd" to be registered. Per the signed Day-0 gate set (recorded in OPERATOR_REQUEST_CHAMIA.md, 23 Jun): **CHAMIA-ENTITY = registration date TBD** — this gates KP corporate `tier_3`. Mark TBD throughout; do not block the sandbox app/secret on it.

---

## 1. The ask — sandbox app + corporate account registration

Two distinct provisioning actions, do not conflate:

- **(A) Sandbox app + HMAC secret** — actionable now (once the Identiti `account_uuid` exists). ~30 min.
- **(B) Corporate `account_uuid` at `tier_3` for "Unique Accessories Ltd"** — GATED on CHAMIA-ENTITY; do not start until the registration date lands. This is the same dependency Klokd carries (playbook §0.5 CHAMIA-ENTITY row).

### App identity

| Field | Value |
|---|---|
| app_slug | `unique_accessories_sandbox` |
| app_name | Unique Accessories |
| legal_entity | Unique Accessories Ltd — **TBD — CHAMIA-ENTITY** (registration date gates corporate `tier_3`) |
| vertical | consumer e-commerce (accessories storefront — Next.js 15 + Sanity) |
| audience_posture | `general_consumer` |
| regulator_exposure | CBK (payments via KP/Daraja, KP-internal) — UA holds no funds, runs no Daraja credentials (Cardinal Rule, KMV guide §8) |
| sandbox_mode | `true` (Stage 1 sandbox; production cutover gated on KP-1-Ops deploy + CBK timeline) |
| tenant_class | `external_billed` (KP has no granular scope model — tenant-class gates access; KMV guide §6 "Scopes") |
| requested_tier | `tier_3` corporate — **TBD — CHAMIA-ENTITY** |
| account_uuid (Identiti) | **TBD** — issued by Identiti at customer/corporate create; Depends-on OPERATOR_REQUEST_IDENTITI.md |
| expected_volume_band | low — MVP storefront, < 1,000 charges/month sandbox→early-prod; single fulfilment origin |
| webhook_callback_base | `${NEXT_PUBLIC_BASE_URL}/api/payment-rail/webhook` — **inert today** (Kafka-only emission; see §6). Registered for the day KP ships the HTTP signer. |

---

## 2. Env vars

App-side naming is locked to `PAYMENT_RAIL_*` (rail-agnostic) per ⚠ **AD-K06** (KMV guide §1; playbook §2.3) — see §7. Silvia: deliver the **secret value**; UA maps it to these names at the boundary.

| Env var | Value | Notes |
|---|---|---|
| `PAYMENT_RAIL_API_BASE` | **TBD — KP NOT DEPLOYED** | `pay.kipkiren.co.ke` does not resolve; KP-1-Ops Railway deploy outstanding (master RECAP §8 item 10; KMV guide §1, §6). Paste an **actually-deployed** URL when it exists, not a Railway dashboard placeholder (KMV guide §1 "URL trap"). Validate `GET <base>/v1/health → 200` before UA writes any business logic. |
| `PAYMENT_RAIL_APP_ID` | `unique_accessories_sandbox` | Opaque app id; also the `app_id` inside the Authorization header. |
| `PAYMENT_RAIL_APP_SECRET` | `<base64url-43>` | ⚠ **ENCODING: base64url-43 — 43 chars, no padding. NOT hex-64 like Identiti.** KP follows the Todoku pattern (KMV guide §1 table + §10 item 3; playbook §2.3). Delivering a hex-64 here produces silent 401 `AUTH_HMAC_INVALID` on every call. Deliver via 1Password, not this file. |
| `PAYMENT_RAIL_AUDIENCE` | `kipkiren_pay` | JWT `aud` for KP-bound step-up `operation_kind`s (KMV guide §6 "Step-up"; playbook §3.1 item 4). |
| ~~`PAYMENT_RAIL_WEBHOOK_SECRET`~~ | **DEFERRED** | ⚠ KP webhook is **KAFKA-ONLY today — no HTTP signer** (KMV guide §6 "DESIGN CALL NEEDED", lines 470–477; playbook §3.2 item 6). This secret **cannot be issued** until KP ships an HTTP webhook signer. Until then the HTTP receiver scaffold is inert and UA consumes Kafka (§6). When the signer lands, encoding = same as `PAYMENT_RAIL_APP_SECRET` (base64url-43). |

`# Phase 3 flip: PAYMENT_RAIL_API_BASE → https://pay.lipastack.co.ke (LipaStack transcendence). Env-var-only change per AD-K06.`

---

## 3. Granted scopes

KP has **no granular per-resource scope model today** (KMV guide §6 "Scopes"). Two named scopes exist only: `operator`, `kipkiren.payments.verify` — neither is required by an external consumer app. Access is gated by **tenant_class** (`external_billed` vs `internal_bypass` vs `portfolio`).

- Requested tenant_class: **`external_billed`**.
- No scope grant required for the endpoints in §5. If KP lands granular scopes on the roadmap, UA expects `charges:initiate`, `charges:read`, `payouts:initiate`, `payouts:read`, `holds:write` — but do not block on this.

---

## 4. Authentication — per-request HMAC

Shared signer across Identiti / KP / Todoku / Helpan; only the Authorization prefix + timestamp header name change (KMV guide §2). **Outer signature output is BASE64; the body hash inside the canonical is hex** (KMV guide §0 facts 1 + 2). Sign the path **WITH the `/v1/` prefix** (KMV guide §0 fact 3).

Authorization header (bodied write example):

```
Authorization: KipkirenPay-HMAC-SHA256 app_id=unique_accessories_sandbox, signature=<base64>
X-KipkirenPay-Timestamp: 2026-06-23T09:41:07.221Z
Content-Type: application/json; charset=utf-8
X-Idempotency-Key: 3f8b1c2e-9a44-4d31-bb2f-7e6c0a1d5f90
```

Canonical signing string — exactly 5 lines joined by `\n` (KMV guide §0 fact 2, §2):

```
{METHOD}
{PATH_AND_QUERY}
{CONTENT_TYPE}
{TIMESTAMP}
{SHA256_HEX(rawBody)}
```

Rules that bite (KMV guide §2, §11):
- `CONTENT_TYPE` = `application/json; charset=utf-8` for bodied requests; **EMPTY STRING for GETs — and send no `Content-Type` header on GET** (signing literal `application/json` on a GET → 401; the gotcha that bit Identiti).
- `{SHA256_HEX(rawBody)}` is hex; the OUTER HMAC is `digest('base64')`. For GET, `rawBody` = `''`.
- `PATH_AND_QUERY` includes `/v1/` and any query string, byte-identical to the request line.

Replay / idempotency windows (KMV guide §0 fact 5):
- **Timestamp:** RFC 3339; **replay window 300s.**
- **`X-Idempotency-Key`:** UUIDv4 on **every write**; rails persist **24h**. For charges/payouts UA also sets a domain-level `idempotency_key`/`external_ref` = `ua_order_<id>` for KP-side idempotency.

**Exact client file path:** `app/lib/rails/payment-rail/client.ts` (HMAC-signed, `import 'server-only'`; shared helper at `app/lib/rails/_shared/signRequest.ts`). Every route handler importing it MUST set `export const runtime = 'nodejs'` — `crypto.createHmac` is Node-only; Edge silently fails (playbook §2.2, §4.2).

---

## 5. Endpoints this app will call

All under `/v1/*`. Money field is `amount_minor` (integer in requests, string in responses). `currency: "KES"` always (no FX — CHAMIA-CURRENCY: catalog re-priced directly in KES minor units).

| Verb | Path | Purpose | Body / notes |
|---|---|---|---|
| POST | `/v1/charges/initiate` | Initiate a cart payment (STK push) | `account_uuid`, `amount_minor` (int), `currency:"KES"`, `purpose:"order_purchase"`, `external_ref:"ua_order_<id>"`, `idempotency_key`. Returns `charge_id`. |
| GET | `/v1/charges/{charge_id}` | Poll charge status | bodyless GET — empty Content-Type, no Content-Type header (§4). |
| POST | `/v1/payouts/initiate` | Refunds (B2C payout) | ⚠ `/initiate` suffix is mandatory — **bare `/v1/payouts` is 404** (KMV guide §6 vocab table; playbook §3.2 item 3). Body: `account_uuid` (recipient), `amount_minor` (int), `purpose:"refund"`, `external_ref:"refund_<order_id>"`, `idempotency_key`. |
| GET | `/v1/payouts/{id}` | Poll payout status | bodyless GET. |
| POST | `/v1/holds` | Escrow holds ("Reserve item 24h") | KP vocab = **hold**, not escrow (KMV guide §6). Optional MVP feature. |

⚠ **Trap inventory (do not get these wrong):**
- ⚠ **Money field name is `amount_minor`** — **NOT `amount_kes_minor`**; an unrecognised field returns **422** (playbook §3.2; KMV guide §6). Scale: KES 50 = `amount_minor: 5000`.
- ⚠ **Integer in requests, string in responses** — responses encode `amount_minor` as a string bigint to dodge JSON precision (KMV guide §6 "Units"). Parse accordingly.
- ⚠ **Payout path** is `/v1/payouts/initiate`; **`/v1/payouts` → 404**.
- ⚠ **Step-up threshold is KES 10,000 (= `1_000_000` minor)** — not KES 5,000 (KMV guide §6 "Step-up"). Refunds ≥ KES 10K must carry an Identiti step-up token: `operation_kind = kipkiren_pay.payout.initiate`, `operation_audience = kipkiren_pay`, `actor = unique_accessories`. Do **not** request a custom `unique_accessories.payout` kind — it is unregistered and 400s (KMV guide §4, §6; playbook §3.1 item 4).

---

## 6. Webhook events / async delivery

**KP emits to Kafka only today — there is no HTTP webhook signer** (KMV guide §6 lines 470–477; playbook §3.2 item 6). UA's HTTP receiver (`app/api/payment-rail/webhook/route.ts` → `app/lib/rails/payment-rail/webhook.ts`, MAIN-LOOP per the Money Rule) is built but **inert** until the signer ships; the **primary event path is a `kafkajs` consumer** (`app/lib/rails/payment-rail/kafka-consumer.ts`), Kafka offset = dedup primitive.

Topics + events:

| Topic | Events |
|---|---|
| `kp.wallet.events` | `WALLET_CREDITED` |
| `kp.payment.events` | `PAYMENT_COMPLETED`, `PAYMENT_FAILED` |
| `kp.payout.events` | `PAYOUT_COMPLETED`, `PAYOUT_FAILED` |

Field-name nuance (KMV guide §6): top-ups carry `mpesa_receipt`; payouts carry `mpesa_conversation_id` — do not conflate. `amount_minor` is string-encoded in events.

**ASK Silvia — two operator deliverables:**
- **(a)** Kafka **consumer credentials + topic ACLs** for `unique_accessories` on `kp.wallet.events`, `kp.payment.events`, `kp.payout.events` (read/consume group).
- **(b)** **ETA for the HTTP webhook signer** so `PAYMENT_RAIL_WEBHOOK_SECRET` (base64url-43) can be issued and the inert HTTP receiver activated. Confirm the webhook canonical/signature scheme when scoped.

---

## 7. Sandbox quirks

- ⚠ **Daraja sandbox MSISDN `254708374149` returns `ResultCode 1037` ("DS timeout"), NOT success** (KMV guide §6 "Sandbox MSISDNs"; playbook §3.2). The Week 2 smoke will appear to fail without this context — UA's smoke synthesizes success callbacks (KP `scripts/full-demo.ts` pattern). Document in `scripts/smoke-payment-rail.ts`.
- Identiti sandbox numbers (`+254700000005/6`) are **not Daraja-registered** and fail at STK push — use the KP-recommended `254708374149` for STK testing, with synthesized callbacks for the success path.
- KP is not deployed (§0 / §2): pre-flight `curl` will fail until KP-1-Ops lands. Smoke is blocked on `PAYMENT_RAIL_API_BASE`.

---

## 8. App-side commitments (informational)

| Item | Owner | Status |
|---|---|---|
| App-side vars named `PAYMENT_RAIL_*`, never `KIPKIREN_*` (AD-K06; survives Phase-3 LipaStack flip as env-only change) | UA eng | ✅ |
| No `DARAJA_*` / `AT_*` / `WHATSAPP_*` creds; KP signs Daraja internally (Cardinal Rule, KMV guide §8) | UA eng | ✅ |
| Money in integer **minor units**, wire field `amount_minor`; Sanity `total_minor` with `Rule.integer().min(0)` | UA eng | ✅ (catalog re-priced directly in KES — CHAMIA-CURRENCY) |
| Catalog re-priced in KES minor units, no FX | UA eng / Chamia | ✅ (CHAMIA-CURRENCY signed) |
| Legacy PayPal orders tagged `legacy:'paypal'`, not dropped | UA eng | ✅ (CHAMIA-DATASET-CLEANUP signed) |
| `external_ref` / domain `idempotency_key` = `ua_order_<id>` for KP-side idempotency | UA eng | ✅ |
| Webhook receiver hand-written in MAIN LOOP; raw bytes via `req.text()` then constant-time verify then `JSON.parse` (Money Rule) | UA eng | ✅ (scaffold; inert pending §6) |
| Anonymous express checkout + post-purchase account upsell (creates tier-0 Identiti account on the fly) | UA eng | ✅ (CHAMIA-AUTH signed) |
| Corporate `tier_3` for "Unique Accessories Ltd" | Chamia | ⏳ **TBD — CHAMIA-ENTITY** (registration date outstanding) |
| Smoke parity with `scripts/smoke-payment-rail.ts` | UA eng | ⏳ blocked on `PAYMENT_RAIL_API_BASE` (KP-1-Ops) |

---

## 9. Cross-reference

- `docs/RAIL_INTEGRATION_PLAYBOOK.md` §2.1 (Cardinal Rule), §2.2 (client location / `runtime='nodejs'`), §2.3 (env vars + per-rail secret encodings), §3.2 (KP per-rail summary + traps), §4.2 (files to ADD).
- `docs/KMV_RAILS_INTEGRATION_GUIDE.md` §0 (five facts), §1 (bootstrap table — KP secret = base64url-43), §2 (shared HMAC signer + Authorization prefixes), §6 (KP full spec — vocab deltas, units, step-up, Kafka-only webhooks, sandbox MSISDNs, scopes), §10 (pre-flight deliverables), §11 (401 debug ladder).
- Master RECAP §8 (23 Jun 2026): item 1 (stale-secret queue — UA is 4th), item 10 (KP-1-Ops Railway deploy outstanding).
- Sibling precedents (`C:/Projects/Klokd`): KP `payment-rail.client.ts` rewrite per KMV guide §13–§14; `OPERATOR_REQUEST_*.md` house template; Klokd chose Kafka-direct for production, KES 10K step-up, `kipkiren_pay.payout.initiate` kind (KMV guide §14).
- Signed Day-0 gates: OPERATOR_REQUEST_CHAMIA.md (CHAMIA-CURRENCY, CHAMIA-AUTH, CHAMIA-DATASET-CLEANUP, CHAMIA-LOGISTICS, CHAMIA-ENTITY).

---

*Operator Request 2/4 · Kipkiren Pay · 23 June 2026 · Confidential · BLOCKED on operator action (sandbox app + secret; corporate tier_3 gated on CHAMIA-ENTITY) · Depends-on: OPERATOR_REQUEST_IDENTITI.md (needs account_uuid first)*
