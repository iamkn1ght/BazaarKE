# Operator Request — Identiti sandbox app registration for Unique Accessories

**To:** Silvia Mumbua (CTO · Kipkiren Teknolojia · Identiti rail operator)
**From:** Unique Accessories engineering · Chamia Mutuku (CEO · KMV) · authored 23 June 2026
**Authority:** cite `docs/RAIL_INTEGRATION_PLAYBOOK.md` §2.3 (env vars) + §2.4 (HMAC discipline) + §3.1 (Identiti per-rail summary) + §0.5 (Day-0 gates) + `docs/KMV_RAILS_INTEGRATION_GUIDE.md` §0 (five universal facts) + §2 (signing helper) + §4 (Identiti full spec) + master RECAP §8 (23 Jun 2026, items 1 + 3)
**Status:** 🟠 BLOCKED on operator action — first of four rail-provisioning asks; file FIRST because Identiti `account_uuid` is the cross-platform foreign key that unblocks KP, Todoku, and Itafika
**Estimated operator effort:** ~30 min (mirrors `lunchdrop_sandbox` / `itafika_sandbox` / `klokd_sandbox` tenant provisioning — same `scripts/seed-tenants.ts` row, different slug) + ~30 min design-time spec for the multi-audience JWT shape (§4a)
**External lead time:** none

---

## 0. Why this / sequencing (dependency rationale)

Identiti is the **root of trust**. Unique Accessories' `account_uuid` (issued by `POST /v1/customers`) is the primary FK on every `order` document in Sanity and the recipient/actor handle on every downstream KP, Todoku, and Itafika call. Until this tenant is seeded, none of the other three Phase-1 rails can be exercised end-to-end:

- **KP** charges/payouts key on `account_uuid` (payer + refund recipient).
- **Todoku** sends require an Identiti `phone_token` (`audience: "todoku"`) as `recipient_token` — raw MSISDN never leaves Identiti per Cardinal Rule (playbook §2.1).
- **Itafika** anchor row records UA's KP `account_uuid`, which itself descends from the Identiti identity.

Per `docs/KMV_RAILS_INTEGRATION_GUIDE.md` §0, this rail's wire contract is the canonical pattern the other three inherit (per-request HMAC-SHA256, **base64 outer signature**, `/v1/*` paths, `{ok, data, meta}` envelope, UUIDv4 idempotency on writes). Get Identiti right and the other clients are a header-prefix swap.

**Queue context (master RECAP §8 item 1 — platform-wide blocker):** three integrator HMAC secrets are already stale at the operator as of 23 Jun — `lunchdrop_sandbox` (20d), `itafika_sandbox` (18d), `klokd_sandbox` (14d). UA's `unique_accessories_sandbox` secret is **4th in that queue** — which is exactly why this request is filed Week 1 Day 1, ahead of any client code, so the rotation/issuance lands before the existing backlog compounds.

**Day-0 gate state (signed 23 Jun, recorded in `OPERATOR_REQUEST_CHAMIA.md`):** CHAMIA-AUTH = anonymous express checkout + post-purchase account upsell (so tier-0 accounts are minted on the fly at checkout); CHAMIA-CURRENCY = catalog re-priced directly in KES minor units; CHAMIA-SANITY-DATASET = `sanityyy`. The one gate still open that touches Identiti is **CHAMIA-ENTITY** — see `legal_entity` in §1.

---

## 1. The ask — sandbox tenant/app registration

Provision a Unique Accessories consuming-app registration on the Identiti sandbox (Railway dev mode, same shape as the `lunchdrop_sandbox` / `itafika_sandbox` / `klokd_sandbox` / LipaStack / Chapaa-SME / family-discovery rows). Seed via `scripts/seed-tenants.ts`; emit the HMAC into `secrets/unique_accessories_sandbox.hmac` and hand over via 1Password.

**App identity:**

| Field | Value |
|---|---|
| `app_slug` | `unique_accessories` |
| `app_name` | Unique Accessories |
| `legal_entity` | Unique Accessories Ltd — **TBD — CHAMIA-ENTITY** (Companies Registry registration date not yet set; gates KP corporate tier_3, NOT this Identiti sandbox tenant — seed the sandbox now, backfill the legal entity on the tenant row when CHAMIA-ENTITY signs) |
| `vertical` | e-commerce/retail |
| `audience_posture` | general_consumer |
| `regulator_exposure` | DPA 2019 (Kenya Data Protection Act) + Consumer Protection Act 2012 |
| `sandbox_mode` | true |
| `tenant` (seed slug) | `unique_accessories_sandbox` |

Note the split: the rail-side **tenant/`APP_ID`** is `unique_accessories_sandbox` (sandbox-suffixed, matches the sibling pattern), while the **`app_slug`** carried in audit/actor claims is `unique_accessories` (no suffix). UA's client sends `app_id=unique_accessories_sandbox` in the Authorization header (§4) and `actor=unique_accessories` in step-up bodies (§5).

---

## 2. Env vars (3 — webhook secret DEFERRED)

Set in UA's deployment env (Vercel project + local `.env`) once the rail-side seed completes. UA's env loader throws `RAIL_CONFIG_INCOMPLETE: identiti` if any of the three are missing — partial config is rejected deliberately to catch deployment mistakes.

| Env var | Value | Notes |
|---|---|---|
| `IDENTITI_API_BASE` | `https://identiti-production.up.railway.app` | Railway URL — the `api.identiti.co.ke` custom domain is NOT cut over yet (playbook §2.3). ⚠ Validate with `GET <base>/.well-known/jwks.json` → 200 before UA writes a line of client code (KMV guide §1 URL trap — Identiti burned 30 min on a dashboard-placeholder URL once). |
| `IDENTITI_APP_ID` | `unique_accessories_sandbox` | Mirrors the tenant slug seeded in `scripts/seed-tenants.ts`. This exact string goes in the `Authorization` header `app_id=` field. |
| `IDENTITI_APP_SECRET` | **hex-64** — exactly 64 hexadecimal characters (`[0-9a-f]{64}`) | ⚠ **Encoding is hex-64, NOT base64url-43.** Identiti is the one cross-cutting rail whose secret is hex (Todoku and KP are base64url-43). Deliver the wrong shape and every UA request 401s with `AUTH_HMAC_INVALID`. The secret is used as the raw HMAC key as-is — `createHmac` does not decode it; UA's loader validates the 64-hex-char shape at boot. Hand over **out-of-band via 1Password** (item `KMV / Identiti / unique_accessories_sandbox HMAC`), never in this file, Slack, or the repo. |
| ~~`IDENTITI_WEBHOOK_SECRET`~~ | **DEFERRED** | Identiti emits **Kafka-only** today (`identiti.kyc.events`, `identiti.account.events`). No HTTP webhook signer exists yet — it ships at **ID-14 Phase 2** (KMV guide §4 + playbook §3.1). UA builds the receiver scaffold now (inert) and activates it when this secret lands. Do not issue a value for this today. |

UA does NOT name these vars `KIPKIREN_*` or anything rail-private; the env-var convention is `IDENTITI_API_BASE / _APP_ID / _APP_SECRET / _WEBHOOK_SECRET` per KMV guide §1.

---

## 3. Granted scopes

Identiti's sandbox per-app registration grants the standard consuming-app scope set; UA needs the customer + phone-token + step-up + tier surface. The two scopes UA explicitly does **not** need and must not be granted:

- ⚠ **`phone_token:resolve` — DO NOT GRANT.** That scope is Todoku-internal. UA is the *producer* of phone tokens (under the customer read/create surface); Todoku is the consumer that resolves them at send time. Apps that call `POST /v1/phone-tokens/resolve` get **403** — UA's client omits that path entirely (§5 trap).
- `identiti:internal:sign:delegated_authority` — Helpan-only hard-pin; not UA's.

If Identiti's sandbox grants a fixed bundle rather than à-la-carte scopes, confirm in the 1Password handover that the bundle covers: create customer, read tier, mint phone token (`audience` producer side), step-up challenge + verify. No additional scope is required for the `audience: "todoku"` phone-token mint — it runs under the customer surface.

---

## 4. Authentication — per-request HMAC

Per-request HMAC-SHA256 on every call (NOT a token-exchange flow), per `docs/KMV_RAILS_INTEGRATION_GUIDE.md` §0 + §2. The **outer signature output is base64** (the LD reference client and older operator packs say hex — they are wrong for the *outer* signature; the body hash *inside* the canonical is hex).

**Authorization header (bodied write example):**

```
Authorization: Identiti-HMAC-SHA256 app_id=unique_accessories_sandbox, signature=<base64>
X-Identiti-Timestamp: 2026-06-23T09:14:05.123Z
X-Idempotency-Key: 7f3c9a2e-5b1d-4c8a-9e0f-2a6b4d8c1e3f
Content-Type: application/json; charset=utf-8
```

- `signature` = base64(HMAC-SHA256(canonical, IDENTITI_APP_SECRET)).
- `X-Idempotency-Key` = UUIDv4 on **every write** (POST). Rails persist it 24h. GETs send no idempotency key.
- ⚠ `Content-Type: application/json; charset=utf-8` is sent **only on bodied requests**. On GETs, send **no Content-Type header at all** and sign the **empty string** for `CONTENT_TYPE` in the canonical. Signing the literal `application/json` on a GET returns 401 — this is the gotcha that bit the Identiti integration (playbook §2.4).

**Canonical signing string** — exactly 5 lines joined by `\n`:

```
{METHOD}
{PATH_AND_QUERY}
{CONTENT_TYPE}
{TIMESTAMP}
{SHA256_HEX(rawBody)}
```

- Line 1: `POST` / `GET` (uppercase).
- Line 2: `PATH_AND_QUERY` ⚠ **signed WITH the `/v1/` prefix** (e.g. `/v1/customers`). Signing `/customers` 404/401s — the LD client omitted `/v1/` because its baseUrl included it; UA's baseUrl does NOT, so the path string must carry `/v1/`.
- Line 3: `application/json; charset=utf-8` for bodied requests; **empty string** for GETs.
- Line 4: RFC 3339 timestamp (`new Date().toISOString()`).
- Line 5: `SHA256_HEX(rawBody)` — hex digest of the **raw serialized body** (empty string `''` for GETs → still hash the empty string).

**Replay window:** 300 s (timestamp must be within ±5 min of server clock). **Idempotency-key TTL:** 24 h.

**Exact client file paths:**
- Shared signer: `app/lib/rails/_shared/signRequest.ts` (the one function that signs every cross-cutting rail; mirror KMV guide §2 verbatim — base64 outer, hex body hash).
- Identiti client: `app/lib/rails/identiti/client.ts` (calls the shared signer; sets `Authorization` prefix `Identiti-HMAC-SHA256` and timestamp header `X-Identiti-Timestamp`).

---

## 4a. PHASE-1 DESIGN-TIME ASK — multi-audience customer-JWT minting (master RECAP §8 item 3)

This is the **one blocking spec question** in this request beyond provisioning — it is a Phase-1 *design-time* block, not a runtime one, and it needs a ~30-min Silvia spec answer, not code.

UA mints a customer JWT via `POST /v1/auth/customer-token` for cart/checkout sessions, carrying **`aud=unique_accessories`** (UA's own audience). For **Phase 2 Hakken**, the *same customer* needs a JWT with **`aud=hakken`** (Hakken returns `401 AUTH_JWT_AUDIENCE` on a mismatched audience — playbook §3.5). This is the same escalation Klokd surfaced 23 Jun (RECAP §8 item 3 / Klokd RECAP §8 row "Customer-JWT issuance for `aud=hakken`").

**Confirm now (so UA's `customer-token` client is built once, correctly):**

1. Does `POST /v1/auth/customer-token` accept **multiple audiences in a single call** (e.g. `{ account_uuid, audiences: ["unique_accessories", "hakken"] }` → one JWT with a multi-valued `aud`, or N JWTs in one response)?
2. OR must UA make **one call per audience** (`aud=unique_accessories` now, a second call with `aud=hakken` at Phase 2)?
3. What is the exact request field name (`audience` singular vs `audiences` array) and the response shape?

UA's preference: a single call returning a multi-`aud` JWT (one round-trip, one cache entry). But UA will build to whatever shape you confirm. **Until confirmed, UA's `getHakkenJwt()` stays a 503-throwing stub** that writes `rail_audit.action='hakken.deferred.jwt'` rows for observability/replay — mirroring Klokd's `getHakkenJwt` pattern. The `aud=unique_accessories` path is unblocked the moment §1 lands; only the Hakken-audience path waits on this answer.

---

## 5. Endpoints this app will call

All under `/v1/*`, all HMAC-signed per §4, all unwrapped at the client boundary to `data` (never let raw `{ok, data, meta}` envelopes leak into business logic — KMV guide §0 fact 4).

| Verb | Path | Purpose | Idempotency-key |
|---|---|---|---|
| POST | `/v1/customers` | Create customer on signup / on-the-fly at anonymous express checkout (CHAMIA-AUTH). Returns `account_uuid` (`acc_<uuid>`) — UA's primary FK on every order. Body needs `phone`, `name_first`, `name_last`, `app_correlation`, `consent{dpa_consent, kyc_consent, marketing_consent, captured_at, captured_via}`. ⚠ `captured_via` enum is hard-locked to `app_onboarding | operator_console | self_service_portal` — anything else 400s (KMV guide §4). | yes |
| POST | `/v1/auth/customer-token` | Issue a customer JWT for cart/checkout session, `aud=unique_accessories`. ⚠ Multi-audience (`aud=hakken`) shape is the §4a design-time block. | yes |
| POST | `/v1/phone-tokens` | Mint a phone token for Todoku dispatch. Body `{account_uuid, audience: "todoku"}`. Returns opaque HS256 JWT + `jti` (`pht_<ULID>`) + `expires_at`. ⚠ 15-min TTL — **never cache beyond freshness window; mint a fresh token per send** (KMV guide §4). UA passes this as Todoku's `recipient_token`. | yes |
| POST | `/v1/stepup/challenges` | Step-up challenge for KP-bound refunds ≥ KES 10,000. Body `{account_uuid, operation_kind: "kipkiren_pay.payout.initiate", operation_audience: "kipkiren_pay", operation_risk_tier, factor: "phone_otp", actor: "unique_accessories"}`. | yes |
| POST | `/v1/stepup/verify` | Submit OTP, receive RS256 step-up JWT (`{stepup_token, expires_in: 300}`). UA verifies the JWT against JWKS, not the app secret. | yes |
| GET | `/v1/customers/{uuid}/tier` | Read KYC tier signal (`tier_0 \| tier_1 \| tier_2 \| tier_3`). High-value orders gate on tier ≥ 1. ⚠ Sign with **empty Content-Type**, no Content-Type header (GET rule, §4). | no |

**⚠ Traps to bake in from day 1:**

- ⚠ **DROP `POST /v1/phone-tokens/resolve` entirely.** It is Todoku-internal, scope-gated to `phone_token:resolve`. UA (a producer, not a resolver) gets **403**. UA's client must not contain that path.
- ⚠ **Tier path is `/v1/customers/{uuid}/tier`, NOT `/v1/accounts/{uuid}/tier`.** The `/accounts/...` form returns **404**.
- ⚠ **Do NOT request a custom `unique_accessories.*` `operation_kind`.** For KP-bound refunds, use the pre-registered **`kipkiren_pay.payout.initiate`** with `operation_audience: "kipkiren_pay"` (KMV guide §4 + §6). `operation_kind` is a hard-coded per-app enum on Identiti's side — any UA-specific kind (e.g. `unique_accessories.high_value_order`) must be registered by Silvia *first* or step-up 400s. For MVP, UA gates step-up on KP-bound payouts only; no UA-specific kind is requested in this round.

UA does NOT call Identiti KYC document-upload endpoints — KYC document submission is Identiti's own web/customer-app flow; UA stores only the tier integer (Cardinal Rule AD-K02, playbook §3.1). National ID / images / biometrics / KRA PIN never touch UA.

---

## 6. Webhook events / async delivery

Identiti is **Kafka-only today** (`identiti.kyc.events`, `identiti.account.events`); HTTP webhook signing ships at **ID-14 Phase 2**. UA builds the receiver at `app/api/webhooks/rails/identiti/route.ts` now (inert — raw body via `req.text()`, constant-time verify, `JSON.parse` only after verify) and activates it when `IDENTITI_WEBHOOK_SECRET` (§2) lands.

**Events UA will subscribe to once HTTP webhooks land (confirm names at ID-14):**

| Event | UA reaction |
|---|---|
| `KYC_TIER_CHANGED` | Re-fetch `GET /v1/customers/{uuid}/tier`; clear cached tier-gate for that account. |
| `SIM_SWAP_DETECTED` | ⚠ Re-mint the phone token **and force re-auth** for the account — a SIM-swap attacker keeps using a stale token otherwise (security gap if UA does not subscribe). |
| `ACCOUNT_DEACTIVATED` | Block checkout for that `account_uuid`. |

⚠ `PHONE_CHANGED` and `ACCOUNT_SUSPENDED` are **NOT** Identiti events — do not provision UA against them; the three above are the canonical set (playbook §3.1 + KMV guide §4).

---

## 7. Sandbox quirks

- **OTP echo in non-prod:** `POST /v1/stepup/challenges` echoes `otp_plaintext` + `sandbox_only: true` in the response body when `NODE_ENV != production` AND `factor=phone_otp`. Production strips both. UA's `IdentitiStepUpChallengeResponse` type marks them optional. This lets UA test the step-up dispatch path in sandbox without Todoku-side SMS delivery.
- ⚠ **Cross-rail token gap (forward note for Todoku):** Identiti sandbox JWTs are rejected by *Todoku* sandbox with `CHAN_PHONE_TOKEN_INVALID` — UA must synthesize `SANDBOX_TOKEN_DELIVER_OK_unique_accessories_<id>` tokens for the local Identiti→Todoku smoke (KMV guide §5). Not an Identiti-side ask, flagged here so the test-phone whitelist below is understood in context.

**Test-phone whitelist request:** seed at least **2 sandbox MSISDNs** for UA, next-in-sequence after the sibling apps (Lunch Drop `+254700000001`, Itafika `+254700000002`, Klokd `+254700000003/4`):

- `+254700000005` — primary customer test number
- `+254700000006` — secondary customer test number (express-checkout / second-account flow)

Confirm the whitelisted numbers in the 1Password handover. (These are Identiti identity-flow numbers; they are NOT Daraja-registered and will fail at KP STK push — that is a KP-side concern handled in `OPERATOR_REQUEST_KP.md`.)

---

## 8. App-side commitments (informational)

| Item | Owner | Status |
|---|---|---|
| Shared HMAC signer `app/lib/rails/_shared/signRequest.ts` (base64 outer, hex body hash, 5-line canonical, GET empty-Content-Type carve-out) | UA engineering | Code-ready after §1 lands; mirrors KMV guide §2 |
| Identiti client `app/lib/rails/identiti/client.ts` (`createCustomer`, `issueCustomerToken`, `issuePhoneToken`, `initiateStepUp` + `verifyStepUp`, `getTier`) | UA engineering | Built per playbook §4.2 against §1 creds |
| `account_uuid` as primary FK on `order` schema (`sanity/schemaTypes/order.ts`) | UA engineering | Additive schema migration per playbook §4.3 |
| Never store raw MSISDN / National ID / biometrics anywhere outside Identiti's phone-token namespace (Cardinal Rule AD-K02) | UA engineering | ✅ Architecturally enforced — phone token resolved per send, never persisted |
| Phone-token freshness — never cached beyond 15-min window; fresh mint per Todoku send | UA `todoku` client path | Built per playbook §3.3 |
| `actor=unique_accessories` claim propagation on step-up calls (audit attribution) | UA engineering | ✅ Built into client at scaffold |
| `traceparent` + `business_op_id` + `request_id` (from `meta.request_id`) on every `rail_audit` row (§A.11 invariant) | UA engineering | Built into client boundary per playbook §2.6 |
| `getHakkenJwt()` stub throwing 503 + `rail_audit.action='hakken.deferred.jwt'` until §4a confirmed | UA engineering | ✅ Stub pattern committed; activates on Silvia spec answer |
| `KYC_TIER_CHANGED` / `SIM_SWAP_DETECTED` / `ACCOUNT_DEACTIVATED` webhook handler | UA `app/api/webhooks/rails/identiti/route.ts` | Inert scaffold; activates when ID-14 Phase 2 webhook secret lands |
| JWKS as a code constant (`${IDENTITI_API_BASE}/.well-known/jwks.json`), 1-h cache, RS256 step-up verify | UA engineering | Public-knowledge URL — not an env var |

---

## 9. Cross-reference

- UA playbook: [`docs/RAIL_INTEGRATION_PLAYBOOK.md`](./docs/RAIL_INTEGRATION_PLAYBOOK.md) §0.5 (Day-0 gates) + §2.3 (env vars) + §2.4 (HMAC discipline) + §3.1 (Identiti per-rail summary) + §4.2/§4.3 (files to add + schema migration)
- KMV guide (mirrored locally, authoritative over operator packs where they conflict): [`docs/KMV_RAILS_INTEGRATION_GUIDE.md`](./docs/KMV_RAILS_INTEGRATION_GUIDE.md) §0 (five universal facts) + §2 (signing helper) + §4 (Identiti full spec) + §10 (operator-request checklist) + §11 (smoke pattern + 401 debug ladder)
- Master cross-rail tracker: `c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md` §8 item 1 (stale-HMAC queue) + item 3 (`aud=hakken` customer-JWT escalation)
- Day-0 gate signatures: `OPERATOR_REQUEST_CHAMIA.md` (CHAMIA-AUTH, CHAMIA-CURRENCY, CHAMIA-SANITY-DATASET signed 23 Jun; CHAMIA-ENTITY open — see §1 `legal_entity`)
- Sibling precedents (same shape, different `app_slug`): `C:\Projects\Klokd\OPERATOR_REQUEST_IDENTITI.md` + `C:\Projects\lunch drop\OPERATOR_REQUEST_IDENTITI.md` + `C:\Projects\itafika\OPERATOR_REQUEST_IDENTITI.md`
- Identiti rail-side: `scripts/seed-tenants.ts` (tenant seed) · `docs/INTEGRATOR_HANDOVER_LUNCHDROP.md` (same wire-format pattern)

---

*Operator Request 1/4 · Identiti sandbox app registration for Unique Accessories · 23 June 2026 · Confidential · Week 1 Day 1 blocker · Depends-on: none (first request)*
