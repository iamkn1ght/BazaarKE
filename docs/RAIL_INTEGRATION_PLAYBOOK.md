# KMV Rail Integration Playbook — Unique Accessories

**Authored:** Chamia Mutuku (CEO · KMV) — 23 June 2026
**Audience:** A fresh Claude Code session opened at `C:\unique_accessories\` whose job is to wire this Next.js storefront to the KMV platform's six rails AND remove the existing PayPal payment integration.
**Status:** Canonical for this app. Self-contained — covers the wire contracts you need without crawling the rail repos.

> **Read this once at session start. Then live in §7 (work plan) and refer back to §2 (shared pattern) + §3 (per-rail) + §4 (PayPal removal) as you go.**

---

## 0. What this is — in one paragraph

Unique Accessories is a Next.js 15 + Sanity CMS e-commerce storefront that currently uses **PayPal** for checkout. This integration replaces PayPal with **Kipkiren Pay** (KP, the KMV payment rail) per the platform's Cardinal Rule — *apps never call third-party payment providers directly* — and adds **five more rails** for the parts of the storefront PayPal was never going to give you: **Identiti** (real customer accounts + KYC + phone tokens, replacing the anonymous-cart pattern), **Todoku** (order/shipping comms via SMS / WhatsApp / in-app — never Africa's Talking or Twilio direct), **Itafika** (rider-fleet logistics for last-mile delivery, replacing whatever DIY logistics was planned), and optionally **Hakken** (cross-app product discovery, Phase 2) and **Helpan AI** (agent-driven personalisation and auto-refill flows, Phase 2). After this work, Unique Accessories is a fully rail-aligned KMV consumer app — KES-denominated, M-Pesa-paid, Identiti-authed, Todoku-communicated, Itafika-delivered.

---

## 0.5 Day-0 hard gates (must answer BEFORE Week 1 starts)

These are decisions that, if unresolved, make Week 1 work either wrong or impossible. Promoted from §6.4 pre-flight because they branch the schema migration / build plan.

| Gate | Decision needed | Why it's Day-0, not pre-flight |
|---|---|---|
| **CHAMIA-CURRENCY** | Is Sanity `product.price` currently KES or USD or unmarked? If USD: what FX rate does the migration use? | §4.3 migration script (`price * 100 → price_minor`) is wrong for USD-historical. If wrong, every product price post-migration is off by a factor. Affects Week 1 Day 4 schema migration. |
| **CHAMIA-SANITY-DATASET** | Canonical dataset is `sanityyy` (per `app/lib/sanity.ts` fallback) or `production` (per `.env.example` default)? | A session that copies `.env.example` → `.env` and supplies no override hits the wrong dataset, finds zero products, assumes the integration broke the catalog read path. Pre-existing tech debt — freeze before any schema migration. |
| **CHAMIA-LOGISTICS** | Confirm Itafika is the chosen last-mile (vs. self-managed riders / G4S / Glovo / etc.) | Affects whether Week 4 Itafika build fires or gets parked. Itafika operator queue has the 14-20 day Identiti HMAC backlog ahead of UA — if Itafika is parked, the whole Week 4 effort is freed. |
| **CHAMIA-ENTITY** | When is legal entity "Unique Accessories Ltd" (or chosen name) formalised? KP corporate tier_3 account requires legal entity registration. | If not done by Week 5, the production cutover slips to wait on Companies Registry. Same dependency Klokd has. |
| **CHAMIA-AUTH** | Anonymous express checkout (creates tier-0 Identiti account on-the-fly) vs. account-required (forces signup before checkout)? | Recommend anonymous express + account upsell post-purchase. Affects Week 1 Day 2-3 auth flow shape. |
| **CHAMIA-DATASET-CLEANUP** | For the dev/staging Sanity dataset's existing test PayPal `order` documents: drop them, OR tag with `legacy: 'paypal'`? | §4.5 says no real customers exist, but staging has test orders. Affects Week 1 Day 4 cleanup pass. |

Block Week 1 kickoff on these — file an `OPERATOR_REQUEST_CHAMIA.md` (or escalate via Slack / WhatsApp) and wait for signed answers.

---

## 1. Authority docs (read at session start)

### Cross-cutting (master KMV folder — your single source of truth for rail state)

- `c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md` — master cross-rail tracker (23 June 2026); see §1.3 rows for each rail's current state, §5 critical path, §8 next concrete actions / open operator gates
- `c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\may23rd\Platform Rails Integration and reboot\App_Integration_Guide_v1_1.md` — **canonical** cross-rail integration patterns (v1_0 at the root is HISTORICAL per master RECAP §1.1)
- `c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\may23rd\Platform Rails Integration and reboot\Platform_Rails_Reboot_Pack_v1_3.md` — six-rail framing + §3 dependency graph + §13.4 region lock (eu-west-1) (note: only v1_2 exists at the root — v1_3 lives in the may23rd subfolder)

### Per-rail wire contracts (canonical references)

- **Hakken** (Phase 2): `C:\Projects\Klokd\docs\HAKKEN_INTEGRATION_REFERENCE.md` (canonical mirror — same file lives at `C:\Projects\lunch drop\docs\`). Wire contract for header-pair auth, entities, broadcasts, ranking query, banned-key wall, PII wall, error codes.
- **Itafika** (Phase 1): `C:\Projects\lunch drop\docs\ITAFIKA_INTEGRATION_REFERENCE.md` (Silvia's secret-free mirror of rail-side commit `24ac829`). Wire contract for asymmetric HMAC (base64 out / hex in), 9-state job machine, 5 anchor webhook events.
- **Hakken + Itafika cross-cutting playbook**: `C:\Projects\Klokd\docs\HAKKEN_ITAFIKA_INTEGRATION_PLAYBOOK.md` (or LD mirror). Cross-rail HMAC + audit + Money-Rule carve-out patterns.
- **Identiti / KP / Todoku / Helpan AI**: the cross-rail integration spec authored by Klokd is the most useful reference — `C:\Projects\Klokd\KMV_RAILS_INTEGRATION_GUIDE.md` (871 lines, authoritative wire-format reference for all four cross-cutting rails; **overrides operator packs** where they conflict). Read this end-to-end before you write a single rail client for Unique Accessories.

### This app's local docs (will exist after Phase 1 work)

- `docs/RAIL_INTEGRATION_PLAYBOOK.md` — this doc
- `docs/KMV_RAILS_INTEGRATION_GUIDE.md` — **MIRROR LOCALLY** at Week 1 Day 1 from `C:\Projects\Klokd\KMV_RAILS_INTEGRATION_GUIDE.md` (~871 lines, secret-free). Klokd's repo state shouldn't be a runtime dependency for UA's integration session — mirror the same way Lunch Drop mirrored `HAKKEN_INTEGRATION_REFERENCE.md` from Klokd.
- `docs/PAYPAL_REMOVAL_RUNBOOK.md` — author at Day 1 of Phase 1, runbook for the PayPal → KP migration
- `docs/RAIL_INTEGRATION_RESULT.md` — author at end of each phase, what's wired / tested / blocked
- `OPERATOR_REQUEST_IDENTITI.md` + `OPERATOR_REQUEST_KP.md` + `OPERATOR_REQUEST_TODOKU.md` + `OPERATOR_REQUEST_ITAFIKA.md` — author at Week 1 Day 1 (mirror Klokd's 5-file pattern at repo root) so Silvia can act on a single artefact per rail instead of parsing a Claude session transcript
- `STARTUP_RAIL_INTEGRATION.md` — paste-into-session bootstrap prompt

---

## 2. The shared rail-consumption pattern — what every rail integration has in common

### 2.1 The Cardinal Rule applied to Unique Accessories

KMV's Cardinal Rule for consumer apps:

| Forbidden — Unique Accessories MUST NOT | Required — Unique Accessories MUST instead |
|---|---|
| Call **PayPal** directly (the existing pattern) | Call **Kipkiren Pay** — STK push + B2C payouts + webhooks |
| Call **Daraja** directly (was never wired) | Same — KP is the only Daraja gateway |
| Call **Africa's Talking**, **Twilio**, **WhatsApp Business API** directly | Call **Todoku** — SMS / voice / WhatsApp / in-app, signed template envelopes only |
| Store **National ID images**, biometric vectors, KMPDC certificates | Call **Identiti** — KYC tier signal only; documents never leave Identiti |
| Store **raw MSISDN** (`+254…`, `254…`, `07…`, `01…`) anywhere outside Identiti's phone-token namespace | Call **Identiti** — phone tokens (opaque IDs, audience-scoped) |
| Hardcode **payment rail base URLs** in source | Read from env vars (`PAYMENT_RAIL_API_BASE` etc.); never literal |
| Use **floating-point** for KES values | Integer **minor units** only (KES 50 = 5000) |

This is the same Cardinal Rule that Klokd v3 ships under (AD-K01..AD-K03 in their advisory). It applies verbatim to this app.

### 2.2 Client location (Next.js App Router conventions)

Every rail client lives at the same path shape, namespaced under **`app/lib/rails/<rail>/`** — matching this app's existing convention (`app/lib/sanity.ts`, `app/lib/sanity-write.ts`, `app/lib/paypal.ts` are all `import 'server-only'`). Top-level `lib/` is reserved for client-side shadcn helpers (`lib/utils.ts` = `cn()`). Don't mix server-only modules into top-level `lib/`.

**Runtime declaration:** every route handler that imports a rail client MUST declare `export const runtime = 'nodejs'` (NOT `edge`) — `crypto.createHmac` is Node.js-only; the Edge runtime would silently fail at request time. **Webhook receivers specifically** must read raw bytes via `await req.text()` (NOT `req.json()`) for the constant-time signature verify — `req.json()` parses the body before you sign-verify, defeating the comparison. Pattern:

```typescript
// app/api/payment-rail/webhook/route.ts
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const rawBody = await req.text()                       // raw bytes BEFORE JSON.parse
  const signature = req.headers.get('x-kp-signature')
  if (!verifyHmacConstantTime(rawBody, signature, SECRET)) return new Response('401', { status: 401 })
  const payload = JSON.parse(rawBody)
  // ... handle
}
```

```
app/lib/rails/
  identiti/
    client.ts          — HMAC-signed HTTP client (server-only)
    types.ts           — request/response envelope types
    index.ts           — public surface

  payment-rail/
    client.ts          — HMAC-signed HTTP client for Kipkiren Pay (server-only)
    webhook.ts         — receiver, signature-verify, idempotency dedup
    types.ts
    money.ts           — KES integer minor-units helpers (kesMinor → kesMajor, formatKes)
    index.ts

  todoku/
    client.ts          — HMAC-signed HTTP client (server-only)
    templates.ts       — ULID-locked template IDs (e.g. UNIQUE_ACCESSORIES_ORDER_CONFIRMED_*)
    index.ts

  itafika/
    client.ts          — HMAC-signed HTTP client (asymmetric base64 out)
    webhook.ts         — receiver (hex HMAC verify, payment-adjacent — MAIN LOOP only)
    types.ts
    index.ts

  hakken/                                              — Phase 2 optional
    client.ts
    index.ts

  helpan/                                              — Phase 2 optional
    client.ts
    webhook.ts                                         — for inbound action dispatch
    index.ts
```

App router routes consume these from `app/api/<surface>/route.ts` (server-only). The cart UI consumes from route handlers (for polling-based flows like STK push status) or server actions (for form-bound flows like signup, address update).

**Why `app/lib/rails/` and not `app/api/rails/`?** Because the same client is called from BOTH `app/api/*` route handlers AND server actions. Lifting the client out of `app/api/` lets both consume it. **Why `app/lib/` not top-level `lib/`?** Because this app's existing server-only modules (`sanity.ts`, `sanity-write.ts`, `paypal.ts`) all live at `app/lib/` — same convention.

### 2.3 Env vars

**Production base-URL reality (per master RECAP §1.3 + KMV guide §1, 23 Jun 2026):**
- Identiti is on Railway — `https://identiti-production.up.railway.app`. The `api.identiti.co.ke` custom domain is NOT cut over yet.
- KP is **NOT DEPLOYED to Railway production yet** (KP-1-Ops still outstanding per master RECAP §8 item 10). Pre-flight curl will fail; production env var is TBD until Silvia cuts over.
- Todoku is on Railway — `https://todoku-prod-production.up.railway.app`. No custom domain yet.
- Itafika is on Railway — `https://itafika-production.up.railway.app` (live + smoke-verified 22 Jun).

**App-secret encodings differ per rail** (per KMV guide §1 — this is a documented gotcha):
- **Identiti** secret = **hex-64** (64 hex chars)
- **Todoku** secret = **base64url-43** (43 base64url chars, no padding)
- **KP** secret = **base64url-43** (same as Todoku — NOT hex like Identiti)
- **Itafika** secret = **hex-64** (per Silvia's IT-S5 handover)

When you file the operator request to Silvia, specify the encoding per rail — otherwise she could deliver the wrong shape.

```env
# === Identiti (root of trust) ===
IDENTITI_API_BASE=https://identiti-production.up.railway.app
IDENTITI_APP_ID=unique_accessories
IDENTITI_APP_SECRET=<hex-64 (64 hex chars) from Silvia, 1Password>
IDENTITI_JWT_ISSUER=https://identiti-production.up.railway.app
IDENTITI_JWKS_URL=https://identiti-production.up.railway.app/.well-known/jwks.json

# === Kipkiren Pay (replaces PayPal) ===
PAYMENT_RAIL_API_BASE=<TBD pending KP-1-Ops Railway deploy — placeholder for now>
PAYMENT_RAIL_APP_ID=unique_accessories
PAYMENT_RAIL_APP_SECRET=<base64url-43 (43 chars, no padding) from Silvia, 1Password>
PAYMENT_RAIL_AUDIENCE=kipkiren_pay        # JWT aud claim for KP-bound step-up operation_kinds
PAYMENT_RAIL_WEBHOOK_SECRET=<pending — see §3.2 — KP has no HTTP webhook signer today, KAFKA-ONLY emission>
# Phase 3 flip: PAYMENT_RAIL_API_BASE → https://pay.lipastack.co.ke (LipaStack transcendence)
# AD-K06: NEVER hardcode — env-var only.

# === Todoku ===
TODOKU_API_BASE=https://todoku-prod-production.up.railway.app
TODOKU_APP_ID=unique_accessories
TODOKU_APP_SECRET=<base64url-43 (43 chars, no padding) from Silvia, 1Password>
TODOKU_WEBHOOK_SECRET=<base64url-43 from Silvia, 1Password>

# === Itafika (last-mile delivery) ===
ITAFIKA_BASE_URL=https://itafika-production.up.railway.app
ITAFIKA_APP_ID=unique_accessories
ITAFIKA_APP_SECRET=<hex-64 (64 hex chars) from Silvia, 1Password>
# There is NO ITAFIKA_WEBHOOK_SECRET — inbound webhooks signed with the SAME ITAFIKA_APP_SECRET.

# === Phase 2 — Hakken (cross-app discovery) ===
HAKKEN_BASE_URL=https://hakken-production.up.railway.app
HAKKEN_APP_KEY=unique_accessories       # = app_slug
HAKKEN_APP_SECRET=<from Silvia, 1Password — encoding TBC per Hakken plugin design>
# Hakken also requires an Identiti customer JWT with aud=hakken on every protected call.

# === Phase 2 — Helpan AI (agent runtime) ===
HELPAN_API_BASE=https://helpan-production.up.railway.app
HELPAN_APP_ID=unique_accessories
HELPAN_APP_SECRET=<from Silvia, 1Password>
HELPAN_WEBHOOK_SECRET=<from Silvia, 1Password>
```

**Existing env vars to DELETE in Phase 1**: `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_API_BASE`, `PAYPAL_WEBHOOK_ID` (all four).

**Existing env vars to KEEP**: `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `NEXT_PUBLIC_SANITY_API_VERSION`, `SANITY_API_TOKEN`.

### 2.4 HMAC discipline — the rails diverge here

**Identiti / KP / Todoku / Helpan AI share a single `signRequest()` helper** — per Klokd's `KMV_RAILS_INTEGRATION_GUIDE.md` §2: *"This one function signs every rail. The only thing that changes is the Authorization header prefix."* Canonical: `METHOD \n PATH_AND_QUERY \n CONTENT_TYPE \n TIMESTAMP \n SHA256_HEX(rawBody)` → base64 outer signature. Mirror the KMV guide's `signRequest()` verbatim.

**Itafika is the only fork** — diverges on (a) inbound webhook encoding (hex, not base64) and (b) the bodyless-GET rule (empty Content-Type signed, no Content-Type header sent — signing the literal `application/json` on a GET returns 401, the gotcha that bit Identiti). Outbound is otherwise the same base64 canonical as the four cross-cutting rails.

**Hakken (Phase 2) uses the interim three-header pair** during pilot — `Authorization: Bearer <identiti-jwt-with-aud=hakken>` + `X-Hakken-App-Key: <slug>` + `X-Hakken-App-Secret: <secret>`. Full HMAC swap is post-pilot (HK-9). **JWT must carry `aud=hakken`** — audience mismatch returns `401 AUTH_JWT_AUDIENCE`. If you mint Identiti customer JWTs with `aud=unique_accessories` (your audience), Hakken calls will fail until you either mint a second JWT for Hakken or extend the audience claim.

**Net pattern:**
- `app/lib/rails/_shared/signRequest.ts` — single helper, one function, four-rail use (Identiti / KP / Todoku / Helpan)
- `app/lib/rails/itafika/sign.ts` — small fork of the shared helper for the asymmetric webhook encoding + bodyless-GET carve-out
- `app/lib/rails/hakken/threeHeaderAuth.ts` — Phase 2 only, completely separate auth shape

### 2.5 Money Rule carve-out — when sub-agents are and aren't safe

KMV's Money Rule: **payment-touching code stays in the main loop, never farmed to sub-agents.** Specifically for this app:

- **KP integration: webhook receiver + capture-confirmation flow + refund flow + KES minor-units helpers stay in MAIN LOOP.** Sub-agents OK for the outbound client (STK push initiation) and types/envelopes.
- **Itafika integration: webhook.ts receiver stays in MAIN LOOP** (payment-adjacent — Itafika charges your KP account internally on `job.delivered`, so the receiver is where you commit delivery-fee reconciliation). Outbound client (quote / create / get / cancel) can be sub-agent-authored.
- **Identiti / Todoku / Hakken / Helpan integrations: no Money Rule.** Sub-agents OK for all of these.

This matches the Klokd v3 pattern. Don't relax it.

### 2.6 Audit propagation — the §A.11 invariant

On every audit_log row your app writes for a rail-side action, set:

```
traceparent       = the W3C traceparent header you sent on the rail call
business_op_id    = your domain id — order_id (KP), shipment_id (Itafika), customer_account_uuid (Identiti)
request_id        = from the rail response envelope's meta.request_id
```

Sanity is your storage layer, so this means: add these three fields to the `order` schema, plus a new `rail_audit` schema (or sub-document) per rail call. See §4.3 for the schema migration.

### 2.7 Smoke parity — match the rail-side script

For each rail, the rail-side `scripts/` folder has a smoke script that asserts the integration is alive. If your client exercises the same sequence with the same assertions, you have parity with what the rail thinks "integrated" means. See per-rail summaries in §3 for paths.

---

## 3. Per-rail summary — what Unique Accessories needs from each

### 3.1 Identiti — root of trust (Phase 1, required)

**Status (23 June):** ID-1..ID-17 closed (14/17 done; 3 open external-gated). 237/237 tests. 3 sibling-rail tenants live but **3 HMAC secrets stale at operator (14–20 days)** — the platform-wide critical block per master RECAP §8. You will need a new tenant: `unique_accessories_sandbox` provisioned by Silvia.

**What Unique Accessories consumes:**

1. **`POST /v1/customers`** — create a customer account on signup. Returns `account_uuid` (your primary FK for orders).
2. **`POST /v1/auth/customer-token`** — issue a customer JWT for cart/checkout sessions. **Carries `aud=unique_accessories`** for your own app; **a SECOND JWT with `aud=hakken`** is required for Phase 2 Hakken calls. The Identiti `/v1/auth/customer-token` endpoint shape determines whether multi-audience minting in a single call is supported, or whether you need a separate endpoint call per audience — **this is the Phase-1 design-time blocker per master RECAP §8 item 3** (the NEW critical operator escalation from 23 Jun).
3. **`POST /v1/phone-tokens`** — mint a `phone_token` (opaque JWT, audience-scoped — pass `audience: 'todoku'` for Todoku send dispatch). **Never store the raw MSISDN.** Never log it. (NOTE: `POST /v1/phone-tokens/resolve` is a Todoku-internal endpoint scope-gated to `phone_token:resolve` — apps that call it get 403. Drop `/resolve` from your client entirely; that path is wrong.)
4. **`POST /v1/stepup/challenges`** + **`POST /v1/stepup/verify`** — step-up authentication for high-value flows. For refunds via KP (≥ KES 10,000), the `operation_kind` is `kipkiren_pay.payout.initiate` with `operation_audience: kipkiren_pay` (per KMV guide §4 + §6) — do NOT request a custom `unique_accessories.payout` kind. The `actor` claim carries `actor=unique_accessories` for audit attribution. For any UA-specific step-up flows (e.g. high-value order placement gate), you'd need an operator request to Silvia to register `unique_accessories.checkout` and/or `unique_accessories.high_value_order` operation_kinds before they work — until then, gate on KP-bound step-up only.
5. **`GET /v1/customers/{uuid}/tier`** — tier signal (0/1/2). Customers can purchase any product at tier ≥ 0; high-value orders gate on tier ≥ 1 (KYC done). (NOTE: NOT `/v1/accounts/{uuid}/tier` — that path returns 404.)
6. **Webhooks (Kafka today; HTTP at ID-14 Phase 2)** — three events Identiti emits:
   - **`KYC_TIER_CHANGED`** — re-fetch tier; clear cached gate
   - **`SIM_SWAP_DETECTED`** — re-mint phone token + force re-auth (security gap if you don't subscribe — a SIM-swap attacker keeps using the stale token otherwise)
   - **`ACCOUNT_DEACTIVATED`** — block checkout for that account

**What Unique Accessories does NOT do:**

- Never store National ID, ID image, KMPDC, KRA PIN images, biometrics. KYC stays inside Identiti per AD-K02.
- Never call Identiti's KYC document upload endpoints — the Identiti web flow / customer app handles document submission.

**Cardinal sub-rule:** the existing anonymous-cart pattern (`use-shopping-cart` client-only mode) gets a **lightweight server-side companion**: cart contents are stored client-side as today, but the *customer* (and their tier + phone-token) is resolved server-side from the Identiti customer JWT. On checkout, the server pulls the cart, validates against the JWT-bound `account_uuid`, and proceeds. Anonymous "express checkout" can stay as an option — it then creates a tier-0 Identiti account on the fly.

**Cart hand-off pattern (anonymous → authed boundary):**

| Scenario | Behaviour |
|---|---|
| Anonymous browse + add to cart | Cart lives in localStorage via `use-shopping-cart`. No server roundtrip. No Identiti contact. |
| Anonymous → login mid-session | On successful Identiti `POST /v1/auth/customer-token`, the client posts the current cart payload to `app/api/cart/hydrate` route. Server merges the anonymous cart into a `cart` Sanity document keyed by `account_uuid`. Local cart cleared after merge confirmed. |
| Authed cross-device | Cart reads on hydrate prefer server (`GET /api/cart` keyed on `account_uuid` from JWT). Local cart is treated as ephemeral and overwritten by server state. |
| Authed checkout | Server pulls from Sanity `cart.{account_uuid}` (NOT localStorage) when initiating KP `/v1/charges/initiate`. Local cart cleared on successful `PAYMENT_COMPLETED`. |
| Anonymous express checkout (CHAMIA-AUTH = "allow anonymous") | Server creates a tier-0 Identiti account on cart-submit (using only a phone token), processes the charge, optionally sends a "claim this account" Todoku message post-purchase. No Sanity `cart` doc is created — order goes directly to Sanity `order`. |
| Account-required checkout (CHAMIA-AUTH = "require account") | Redirect to login before checkout button activates. |

Net effect: the cart is **client-only when anonymous, server-authoritative when authed**. No double-source-of-truth bug class because the boundary is the login event.

**Smoke script reference:** mirror Klokd's `octopus-api/scripts/smoke-identiti.ts` shape (3/4 endpoints verified live; see Klokd RECAP §deployment).

### 3.2 Kipkiren Pay — payments (Phase 1, required — replaces PayPal)

**Status (23 June):** KP-1..KP-12 + KP-15..KP-18 closed. KP-14 cross-rail scaffolding LIVE 10 June. 469/469 tests. **KP-1-Ops Railway deploy still pending — production live cutover not yet done.** Stage 1 sandbox reached; CBK production timeline 3–9 months.

**What Unique Accessories consumes (wire field names are unforgiving — KMV guide §6 explicitly flags `amount_minor` as the canonical key and the `/initiate` suffix as a trap):**

1. **`POST /v1/charges/initiate`** (KP-16, app-mediated charges) — initiate a payment for a cart. Body includes `account_uuid`, **`amount_minor`** (integer KES minor units), `currency: "KES"`, `purpose: "order_purchase"`, `external_ref: "ua_order_<id>"`, `idempotency_key`. Returns `charge_id` and triggers an STK push to the customer's M-Pesa.
2. **`GET /v1/charges/{charge_id}`** — poll for charge status (or rely on Kafka event).
3. **`POST /v1/payouts/initiate`** (KP-5, B2C payouts) — refunds. **Note the `/initiate` suffix — KMV guide §6 calls this a trap (LD's reference client got it wrong; `/v1/payouts` returns 404).** Body includes `account_uuid` (recipient), **`amount_minor`** (integer KES minor units), `purpose: "refund"`, `external_ref: "refund_<order_id>"`. Subject to step-up if amount ≥ KES 10K — your refund flow must verify a step-up token (operation_kind `kipkiren_pay.payout.initiate`) from Identiti before calling KP.
4. **`GET /v1/payouts/{id}`** — poll payout status.
5. **`POST /v1/holds`** (KP-9) — escrow holds. Use if you implement "Reserve item for 24h" features.
6. **Webhook delivery — KAFKA-ONLY today (NO HTTP signer):** KP emits to `kp.wallet.events`, `kp.payment.events`, `kp.payout.events` Kafka topics — there is no HTTP webhook signer yet (per KMV guide §6 lines 470-477, "DESIGN CALL NEEDED"). Event names: `WALLET_CREDITED`, `PAYMENT_COMPLETED`, `PAYMENT_FAILED`, `PAYOUT_COMPLETED`, `PAYOUT_FAILED`. Body field is `amount_minor` (string-encoded bigint in responses to dodge JSON precision; integer in requests). `PAYMENT_RAIL_WEBHOOK_SECRET` in §2.3 **cannot be filled today** — wait for KP's roadmap item, OR pivot to a Kafka consumer using `kafkajs` for production. The 5-week plan in §7 assumes a Kafka consumer; the playbook builds an inert HTTP receiver scaffold pending KP's signer commit.

**Cardinal sub-rules:**

- KES integer **minor units** only — wire field name is **`amount_minor`** (NOT `amount_kes_minor` — that's not a recognised field and KP returns 422). Scale: KES 50 = `amount_minor: 5000`.
- Sanity `order.total` already stores numbers; migrate to integer minor units (Sanity field name: `total_minor`, NOT `total_kes_minor`).
- Use your `order_id` as both `external_ref` (idempotency at KP) AND `idempotency_key` header (per-request).
- **Sandbox MSISDN quirk:** per KMV guide §6, the canonical Daraja sandbox test number `254708374149` returns `ResultCode 1037` (DS timeout), NOT a success. The Week 2 Day 5 smoke will APPEAR to fail without this context — use `scripts/full-demo.ts`-style synthesized callbacks to test the success path. Document in your smoke script.
- Never call Daraja directly. Never store STK push tokens, customer Daraja receipts, or M-Pesa transaction codes outside the KP-returned `kp_transaction_ref`.

**Webhook receiver = MAIN LOOP authoring.** Per Money Rule, hand-write `app/lib/rails/payment-rail/webhook.ts`. Verify signature constant-time before JSON.parse. Replay window 300s. Dedupe on `(event_type, kp_transaction_ref)`. **Dedup store must be Vercel KV / Upstash Redis** — NOT Sanity (per §4.6 below — Sanity's eventually-consistent write latency creates a race window where two parallel webhook invocations both see no dedup row, both write, both fire downstream). On the Kafka path, the consumer offset is your dedup primitive.

**Currency translation from PayPal:**

- Existing PayPal orders use whatever currency the Sanity `product.price` is set to (likely USD or unmarked). The Sanity `product` schema must be migrated to **KES integer minor units** (e.g. `price_kes_minor: 500000` for KES 5,000.00).
- Catalog migration is part of the PayPal removal runbook (§4).

**Smoke script reference:** mirror Klokd's `scripts/smoke-payment-rail.ts` shape.

### 3.3 Todoku — communications (Phase 1, required — replaces direct SMS plans)

**Status (23 June):** TD-0..TD-9 + TD-12 + TD-13 (extended) + TD-14 closed. **6 tenants live** (sandbox + itafika + kws + hakken_internal + lipastack + klokd_sandbox). 250/250 tests. LIVE on Railway.

**What Unique Accessories consumes (field-name traps — KMV guide §5 lines 363 explicitly calls these out as "field-name traps"; using `phone_token` / `params` / `variables` returns `400 additionalProperty` error):**

1. **`POST /v1/messages/send`** — send a templated message. Body shape (canonical, per KMV guide §5):
   - **`recipient_token`** (the Identiti `phone_token` JWT — NOT `phone_token`)
   - **`template_id`** (ULID)
   - **`template_variables`** (object of `{key: value}` — NOT `params`, NOT `variables`, NOT `vars`)
   - **`channel`** (required: `"sms" | "whatsapp" | "voice" | "in_app"`)
   - **`idempotency_key`**
2. **`POST /v1/messages/send-bulk`** — for marketing comms (cart abandonment campaigns, restock alerts). Same field shape, accepts array.
3. **`GET /v1/messages/{id}`** — delivery status.
4. **Webhooks**: delivery receipts (delivered / failed / opened).

**Sandbox quirk (per KMV guide §5 lines 418-426):** Todoku sandbox **rejects real Identiti sandbox JWTs with `CHAN_PHONE_TOKEN_INVALID`** — you must synthesize `SANDBOX_TOKEN_DELIVER_OK_<slug>_<id>` tokens locally for Week 3 Day 5 smoke. Real Identiti JWT only works against Todoku production once both rails cut over.

**Mandatory anti-impersonation copy per template class (KMV guide §5 lines 398-404):** Todoku auto-rejects template submissions that miss the mandatory copy line per class — `class_0` (OTP) needs an anti-phishing line; `class_1` (payment confirmations, shift/order updates) needs an anti-social-engineering line; `class_2` (marketing) is less strict. Build the anti-impersonation copy into all 8 template submissions at operator-request time, not after rejection.

**New tenant to provision (operator request to Silvia):**

- Tenant: `unique_accessories` (external-billed)
- 8 templates (all class_1 / class_2 — anti-phishing required on class_0 OTP class):
  1. `unique_accessories_order_confirmed_sms` (class_1)
  2. `unique_accessories_order_confirmed_whatsapp` (class_1)
  3. `unique_accessories_shipping_dispatched_sms` (class_1)
  4. `unique_accessories_delivery_imminent_sms` (class_1)
  5. `unique_accessories_delivery_completed_sms` (class_1)
  6. `unique_accessories_refund_initiated_sms` (class_1)
  7. `unique_accessories_cart_abandonment_whatsapp` (class_2, marketing)
  8. `unique_accessories_restock_notification_whatsapp` (class_2, marketing)
- Sender ID registration: **`UAKE`** (proposed) — 4-letter, 2–4 week CA-K regulatory lead time — batch with operator request.

**Why UAKE (4 chars):** CA-K (Communications Authority of Kenya) allows 3–11 alphanumeric chars. UAKE is "U" + "A" + "KE" (country code) — short, brand-tagged, memorable, fits CA-K's compact-id preference, and matches the 4-char pattern most KMV apps converge on. Alternatives if Chamia prefers a longer brand-friendly ID: `UAccess` (7), `UAccessories` (12 — over limit), `UAKenya` (7). Sender ID is customer-visible on every SMS, so it functions as ambient brand surface. Klokd chose `Klokd` (5) + fallback `KlokdOTP` (8). Lock the choice at operator-request time — once CA-K approves, changing it requires a fresh 2–4 week filing.

**Cardinal sub-rules:**

- Never call Africa's Talking / Twilio / WhatsApp Business API directly. All comms via Todoku per AD-K03.
- Never store raw MSISDN. Resolve phone token from Identiti, send via Todoku.
- Templates must be locked by ULID in `lib/rails/todoku/templates.ts` (constant export). Never inline template strings — Todoku rejects unregistered templates.

**Smoke script reference:** mirror Klokd's `scripts/smoke-todoku.ts` shape (`POST /v1/messages/send` returned 201 confirmed).

### 3.4 Itafika — last-mile delivery (Phase 1, required for physical goods)

**Status (23 June):** IT-S5 **PROVISIONED + SMOKE-VERIFIED 22 June** for Lunch Drop (anchor `lunchdrop`, signed POST /v1/jobs returned 201). HARDEN-1 code+DB done. **NEW BLOCKER: OPS-6 Railway billing** — Itafika trial expired, blocks any rail-side redeploy (does NOT block your client work against the currently-deployed dev image).

**For Unique Accessories, a new anchor must be seeded:** `unique_accessories` (operator-side action by Silvia — same pattern as `lunchdrop` per IT-S5).

**What Unique Accessories consumes (mirrors the canonical Itafika integration reference at `C:\Projects\lunch drop\docs\ITAFIKA_INTEGRATION_REFERENCE.md` — note Itafika uses `_minor` suffix, NOT `_kes_minor`):**

1. **`POST /v1/jobs/quote`** — price a delivery (no create). Body: `origin: {lat, lng, label}` (your warehouse/fulfilment centre), `destination: {lat, lng, label}` (customer address), `distance_meters` (integer), `tier: "standard" | "express"` (only those two values). Returns **`price_minor`**, **`rider_payout_minor`**, **`move_take_minor`**, `distance_meters`, `tier` (KES integer minor units). Useful for showing delivery fee at checkout.
2. **`POST /v1/jobs`** — create a dispatch. Body includes **`anchor_reference_id: "ua_order_<id>"`** (your order id — this is the **second idempotency layer**: re-creating with the same `anchor_reference_id` returns the existing job. Use your order_id as the value so safe retry doesn't need UUID coordination), `origin`, `destination`, `distance_meters`, `tier`. Returns `job_id`, `state: "PENDING_ASSIGNMENT"`, `price_minor`, `rider_payout_minor`. Triggered after KP `PAYMENT_COMPLETED` Kafka event lands.
3. **`GET /v1/jobs/{job_id}`** — poll for state.
4. **`POST /v1/jobs/{job_id}/cancel`** — cancel a job (pre-DELIVERED only).
5. **Webhooks (5 events)**: `job.assigned` (rider matched — notify customer via Todoku), `job.picked_up` (rider at warehouse — log audit), `job.delivered` (commit delivery-fee reconciliation against KP statement, mark order DELIVERED in Sanity, trigger review request via Todoku), `job.failed` (rider couldn't deliver — surface to customer), `job.cancelled`.

**Auth specifics (asymmetric — read carefully):**

- **Outbound (Unique Accessories → Itafika):** base64 HMAC. `Authorization: Itafika-HMAC-SHA256 app_id=unique_accessories, signature=<base64>` + `x-itafika-timestamp` + `x-idempotency-key` + (bodied requests) `content-type: application/json; charset=utf-8`. Canonical: `METHOD \n PATH_AND_QUERY \n CONTENT_TYPE \n TIMESTAMP \n SHA256_HEX(rawBody)`.
- **Bodyless GET gotcha:** sign **empty Content-Type** in the canonical AND send no Content-Type header. Signing the literal `"application/json"` on a GET returns 401. This bit the Identiti integration; bake it in from day 1.
- **Inbound (Itafika → Unique Accessories):** hex HMAC. `X-Itafika-Signature: hex(HMAC-SHA256("<timestamp>.<rawBody>", secret))` + `X-Itafika-Event` + `X-Itafika-Timestamp`. Verify raw bytes, constant-time, **before JSON.parse**, 300s replay window, dedupe on `job_id + event`.

**What Unique Accessories does NOT do:**

- Anchor registration (`POST /v1/anchors` is admin-token-only — operator handles via `scripts/seedAnchors.ts`).
- KP-16 charge initiation for delivery fees — Itafika charges your KP account internally on `job.delivered`. You only supply your KP `account_uuid` (Silvia records it on the anchor row).
- Rider management / KYC / payouts (all rail-internal).

**KP-16 charging is INERT today** (per Itafika reference §5 + §7 + §9): Itafika needs (a) your KP `account_uuid` recorded on the anchor row AND (b) Itafika's OPS-4 (KP `itafika_sandbox` creds) to land before any delivery-fee charging fires. Today the `job.delivered` webhook fires successfully but no KES moves. **Delivery-fee reconciliation is observe-only at MVP** — log the expected fee, watch for the eventual KP statement entry once OPS-4 lands.

**Region anomaly worth noting:** Itafika's Supabase is in **eu-west-2** (London), not the locked **eu-west-1** per Reboot Pack v1.3 §13.4. Silvia is resolving before Stage 2 (per master RECAP §1.3 Itafika row). Does not affect your integration functionally; flagged for awareness.

**Money Rule callout:** `app/lib/rails/itafika/webhook.ts` is the receiver where `job.delivered` triggers delivery-fee reconciliation. **Hand-write this in the main loop.** Sub-agents OK for `app/lib/rails/itafika/client.ts` (quote / create / get / cancel — non-payment outbound).

### 3.5 Hakken — cross-app discovery (Phase 2, optional)

**Status (23 June):** HK-1..HK-7 closed + HK-8 PARTIAL + HK-9 PARTIAL + HK-10 PARTIAL+. Cumulative 159/194 pts (~82%). 149/149 unit tests. Two plugins live: `lunch_drop_v1` + `klokd_two_sided_v1`. **A `unique_accessories_v1` plugin does NOT yet exist** — Phase 2 work for Silvia's team. Until then, this section is design only.

**What Unique Accessories would consume (when Phase 2 lands):**

1. **`POST /v1/entities`** — register product entities with `entity_type=product` (or whichever the `unique_accessories_v1` plugin defines), `role_flags=["publisher"]`, `external_ref="ua:product:<sanity_id>"`. **Cache the returned `entity_id` (UUID)** — you'll need it as `publisher_id` on every broadcast.
2. **`POST /v1/broadcasts`** — broadcast `new_arrival` (when a new product lands in Sanity) and `restock` (when an item that was out-of-stock comes back). Body envelope **requires** `consent_scope` (single_app | cross_app_optional | cross_app_required) and `ttl_at` (ISO-8601 future, ≤ now + 168h) — missing either = schema-fail or 422.
3. **`POST /v1/ranking/query`** — discovery query (search across all KMV-registered products from Unique Accessories alongside other Hakken-registered apps). `vertical=unique_accessories`, `user_role=consumer`, `query_type=one_sided`.

**Hakken §10.7 banned-key wall — these keys return `422 REGULATORY_CONTAINMENT_VIOLATION` at any depth:**

`amount`, `currency`, `funds`, `credit`, `yield`, `float`, `transfer`, `disburse`, `debit`, `refund`, `withdraw`, `deposit`, `money`, `balance`, `settlement`, `commission`, `ledger`, `kes_amount`, `usd_amount`, `monetary_value`, `source_payment*`

\* `source_payment` carved out for `/v1/entities/` and `/v1/tiers` only.

**Approved alternatives:** `price_range_kes: [50, 5000]` (array of integer minor units) for product prices in broadcasts. `tier_slug: 'boosted'` for tier reference. Never `monetary_value`.

**Hakken PII wall:** no MSISDN, no email, no two-word capitalised names, no `name`/`full_name`/`first_name`/`last_name` fields. Use opaque IDs (`publisher_id`, `product_id`).

**Hakken JWT requirement:** Identiti customer JWT must carry **`aud=hakken`** — audience mismatch returns `401 AUTH_JWT_AUDIENCE`. Mint a separate JWT for Hakken, or extend the audience claim on your existing JWT.

**Defer this until:** Silvia commits a `unique_accessories_v1` plugin to Hakken AND the rail-side cross-vertical product-discovery model is shipped (HK-9 / HK-10 work). Until then, document the design here and re-open as Phase 2.

### 3.6 Helpan AI — agent runtime (Phase 2, optional)

**Status (23 June):** H-1..H-12 + H-15..H-17 closed (12 June: Console UI §6.19 + H-17 Kafka outbox closed). 294/294 tests. 5 agents registered (`helpan-klokd-v1`, `helpan-lunchdrop-v1`, `helpan-chapaa-v1`, `helpan-family-discovery-v1`, `helpan-kws-v1`). **A `helpan-unique-accessories-v1` agent does NOT yet exist** — Phase 2 work.

**What Unique Accessories would consume (when Phase 2 lands):**

1. **Helpan-driven personalised shopping**: customer sets a briefing ("notify me when X is back in stock"; "auto-restock my favourite item every 90 days"), Helpan agent matches against Unique Accessories broadcasts (via Hakken `restock` events from §3.5), and either notifies via Todoku OR auto-purchases via Helpan `POST /v1/actions/dispatch` → Unique Accessories' `app/api/agent/checkout/route.ts` (a server-only "agent-initiated" checkout flow).
2. **Helpan dispatch contract**: Unique Accessories registers as a **target rail** in addition to being a consuming app — meaning Helpan can post actions TO Unique Accessories (auto-purchase events). Implement `app/api/agent/checkout/route.ts` with the dual-role pattern Klokd shipped (commit `73e27d6`, 11 June — see Klokd RECAP).
3. **Audience posture**: `helpan-unique-accessories-v1` defaults to **`general_consumer`** (same as `helpan-klokd-v1`, `helpan-lunchdrop-v1`, `helpan-chapaa-v1`, `helpan-kws-v1`). The `family_friendly` posture is **portfolio-locked to `helpan-family-discovery-v1`** per H-12 (master Sprint Backlog explicitly says "only family_friendly audience_posture in portfolio"); choosing `family_friendly` for UA would require an `OPERATOR_REQUEST_HELPAN.md` design ask to extend the portfolio's family_friendly posture AND likely a DPA review (children-data implications). Default to `general_consumer`.

**Defer this until:** Phase 1 is rock-solid AND there's product evidence customers want agent-driven purchasing. For an MVP storefront, this is over-engineering.

---

## 4. PayPal → Kipkiren Pay migration plan

This is the single most invasive change. PayPal touches checkout flow, Sanity order schema, environment configuration, and customer expectations.

### 4.1 What to DELETE

| File / path | Why |
|---|---|
| `app/api/paypal/create-order/route.ts` | Replaced by KP STK push initiation |
| `app/api/paypal/capture-order/route.ts` | Replaced by KP `PAYMENT_COMPLETED` Kafka consumer / webhook handler |
| `app/api/paypal/webhook/route.ts` | Replaced by KP receiver at `app/lib/rails/payment-rail/webhook.ts` |
| **`app/lib/paypal.ts`** | Replaced by `app/lib/rails/payment-rail/client.ts`. **NOTE: file is at `app/lib/paypal.ts`, NOT top-level `lib/paypal.ts`** — `lib/` only contains the shadcn `utils.ts`. A literal `rm lib/paypal.ts` exits 0 with nothing deleted, leaving the entire PayPal server module on disk in violation of Cardinal Rule AD-K01. |
| `app/components/CheckoutNow.tsx` (PayPal buttons) | Replaced by a KP checkout component (phone-token input → STK push → status polling) |
| `app/components/Providers.tsx` — DELETE `<PayPalScriptProvider>` wrapper | KP doesn't need a client SDK. **See §4.1b "What to MODIFY" — the same file has a `<USCProvider currency="USD">` line that must FLIP to `"KES"`, not be deleted.** |
| `package.json` dependency `@paypal/react-paypal-js` | Remove |
| Env vars: `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_API_BASE`, `PAYPAL_WEBHOOK_ID` | Remove from `.env.example`, `.env`, and any deployment config (Vercel) |

**Per Cardinal Rule AD-K01 applied to this app: leave NO PayPal code, env vars, or dependencies on disk after migration.** Same discipline Klokd applied when deleting Daraja.

### 4.1b What to MODIFY (keep file, change content)

| File / path | Change |
|---|---|
| `app/components/Providers.tsx` | DELETE `<PayPalScriptProvider currency="USD" language="en-UK">` wrapper. FLIP `<USCProvider currency="USD" ...>` → `<USCProvider currency="KES" ...>`. The `use-shopping-cart` library persists cart state client-side with the currency baked into formatting — if the prop stays USD, all post-migration cart prices display dollar signs against KES integer minor units. |
| `app/lib/sanity.ts` | KEEP as-is (read client). Confirm fallback dataset literal (`'sanityyy'`) matches `.env.example` default (`'production'`) per CHAMIA-SANITY-DATASET decision in §0.5 — they currently disagree (pre-existing tech debt). |
| `app/lib/sanity-write.ts` | **KEEP** (server-only write client). KP webhook receiver uses this to patch order state. Do NOT delete; it's not PayPal-adjacent. |
| `sanity/schemaTypes/order.ts` | EXTEND per §4.3 (add new fields alongside legacy; legacy fields stay during transition). |
| `sanity/schemaTypes/product.ts` | EXTEND per §4.3 (add `price_minor` alongside legacy `price`). |
| `next.config.ts` | Confirm `cdn.sanity.io` whitelisted for `next/image`. **No new image hosts needed at MVP.** Phase 2 / future considerations: if you surface Itafika rider avatars in the "your delivery is on its way" UI, add `itafika-production.up.railway.app` (or future rider-CDN). If you render KP receipts/PDFs as inline images, add the KP receipts CDN host. Add to `next.config.ts` `images.remotePatterns` only when you actually surface those resources — pre-allowlisting is unnecessary attack surface. |
| `.env.example` | DELETE 4 PayPal vars; ADD 4-rail set per §2.3. |

### 4.1c What to KEEP (untouched)

- `app/lib/sanity.ts` (read), `app/lib/sanity-write.ts` (write)
- `sanity/sanity.config.ts`, `sanity/schemaTypes/product.ts`, `sanity/schemaTypes/category.ts`, `sanity/schemaTypes/heroImage.ts` (schemas — extend `order.ts` only)
- All UI components except `CheckoutNow.tsx` (delete) and `Providers.tsx` (modify)
- All route handlers except `app/api/paypal/*` (delete)
- `package.json` minus `@paypal/react-paypal-js` (add `kafkajs` + a Vercel KV client for webhook dedup per §4.6)

### 4.2 What to ADD

| File / path | Purpose |
|---|---|
| `app/lib/rails/_shared/signRequest.ts` | Single shared HMAC helper for Identiti / KP / Todoku / Helpan (mirror KMV guide §2 verbatim — same function, one Authorization-prefix param) |
| `app/lib/rails/payment-rail/client.ts` | KP HMAC-signed client (mirror Klokd's `PaymentRailClient` per `KMV_RAILS_INTEGRATION_GUIDE.md`) |
| `app/lib/rails/payment-rail/webhook.ts` | Inbound webhook receiver (signature verify + idempotency dedup via Vercel KV + Sanity order patch). **MAIN LOOP only — Money Rule.** **INERT pending KP HTTP signer commit — see §3.2.** |
| `app/lib/rails/payment-rail/kafka-consumer.ts` | **PRIMARY KP event path today** (`kp.wallet.events` + `kp.payment.events` + `kp.payout.events`). Uses `kafkajs`. Kafka offset is dedup primitive. |
| `app/lib/rails/payment-rail/types.ts` | DTOs for charges, payouts, holds, Kafka event envelopes |
| `app/lib/rails/payment-rail/money.ts` | KES integer minor-units helpers — `kesMinor(123) → "KES 1.23"`, `parseKesMinor("1.23") → 123`. Per AD-K07. Wire field name is `amount_minor`. |
| `app/api/checkout/initiate/route.ts` | POST → KP STK push, returns `charge_id` for client to poll. `export const runtime = 'nodejs'` (Edge runtime can't HMAC-sign). |
| `app/api/checkout/status/route.ts` | GET → KP `GET /v1/charges/{charge_id}`, returns status for polling. `runtime = 'nodejs'`. |
| `app/api/payment-rail/webhook/route.ts` | KP webhook receiver route (delegates to `app/lib/rails/payment-rail/webhook.ts`). **Raw body via `req.text()` THEN signature verify THEN `JSON.parse(rawBody)`** — `req.json()` parses before verify, defeats the constant-time compare. |
| `app/components/KipkirenPayCheckout.tsx` | Replaces `CheckoutNow.tsx` — phone-token input → STK push → status polling. STK push has a 60s timeout on customer's M-Pesa PIN entry; UX needs clear "Check your phone for M-Pesa prompt" + 90s countdown + retry. |
| `app/lib/rails/identiti/client.ts` | Identiti HMAC client (for customer accounts + phone tokens + step-up). Uses shared `signRequest()`. |
| `app/lib/rails/todoku/client.ts` | Todoku client (for order/shipping comms). Uses shared `signRequest()`. |
| `app/lib/rails/itafika/client.ts` + `sign.ts` + `webhook.ts` | Itafika client + the forked `sign.ts` (asymmetric base64-out / hex-in + bodyless-GET empty-Content-Type rule) + webhook receiver. Webhook = MAIN LOOP per Money Rule. |
| `app/lib/idempotency/kv.ts` | Vercel KV / Upstash Redis client wrapper for webhook-event dedup keyed on `(rail, event_type, idempotency_key)` with TTL = replay window (300s) + safety margin |

### 4.3 Sanity schema migration (orders + products)

Existing `order` schema (verified from `sanity/schemaTypes/order.ts`):
```typescript
// FIELD TYPES PER SANITY SCHEMA — not all are structured objects
{
  _type: 'order',
  _id: `order.${paypalOrderId}`,
  status: string,
  currency: string,
  total: number,                                        // Sanity type: 'number' (accepts floats — no integer validator)
  items: Array<{...}>,
  payerEmail: string,
  payerName: string,
  shippingAddress: string,                              // Sanity type: 'text' — FREE-TEXT STRING, not a structured object
  capturedAt: string,
  rawCapture: string,                                   // Sanity type: 'text' — JSON.stringified PayPal response, not Record<string, unknown>
}
```

**Reading from these fields:** `shippingAddress` and `rawCapture` are single text fields. To extract structured data, you must `JSON.parse(rawCapture)` and parse the address string. This affects the migration plan: a legacy `shippingAddress` text blob has no `geo.lat/lng` for Itafika dispatch — either drop legacy orders (none are real customers yet per §4.5), or backfill via a geocoding pass.

New `order` schema (post-migration; ADDITIVE — keep legacy fields during transition):

```typescript
{
  _type: 'order',
  _id: `order.${kpChargeId}`,                           // KP charge_id is the new idempotency key
  account_uuid: string,                                  // Identiti account_uuid (primary FK)
  state: 'PENDING_PAYMENT' | 'PAID' | 'DISPATCHED' | 'DELIVERED' | 'FAILED' | 'REFUNDED' | 'DISPUTED',
  total_minor: number,                                   // Sanity type: 'number' with Rule.integer().min(0); KES integer minor units (KES 50 = 5000). NOT total_kes_minor — KP wire field is amount_minor.
  items: Array<{
    product_id: string,                                  // Sanity product._id
    name: string,
    qty: number,                                         // Rule.integer().min(1)
    unit_price_minor: number,                            // Rule.integer().min(0); integer minor units
  }>,
  shipping_address: {                                    // STRUCTURAL CHANGE — new object field (legacy shippingAddress text stays for historical orders)
    street: string,
    city: string,
    geo: { lat: number, lng: number },                   // numeric, for Itafika dispatch
    label?: string,
  },
  kp_charge_id: string,
  kp_transaction_ref?: string,                           // M-Pesa receipt code from KP Kafka event
  itafika_job_id?: string,
  paid_at?: string,
  delivered_at?: string,
  traceparent: string,                                   // §A.11 invariant
  business_op_id: string,                                // = your internal order id
  rail_audit: Array<{                                    // §A.11 audit row per rail call
    rail: 'identiti' | 'kp' | 'todoku' | 'itafika' | 'hakken' | 'helpan',
    action: string,
    request_id: string,
    timestamp: string,
    success: boolean,
    error_code?: string,
  }>,
}
```

**Mandatory Sanity validators for every `*_minor` field** (Sanity's `type: 'number'` accepts floats by default — only the validator enforces integer minor-units; sub-agents will silently re-introduce floats without this):

```typescript
{ name: 'total_minor', type: 'number', validation: (Rule) => Rule.integer().min(0).required() }
{ name: 'unit_price_minor', type: 'number', validation: (Rule) => Rule.integer().min(0).required() }
{ name: 'price_minor', type: 'number', validation: (Rule) => Rule.integer().min(0).required() }
{ name: 'qty', type: 'number', validation: (Rule) => Rule.integer().min(1).required() }
```

New `product` schema additions:

```typescript
{
  // ...existing fields...
  price_minor: number,                                   // ADD alongside legacy `price`; Rule.integer().min(0)
  // Legacy `price` field stays during transition; read path migrates to price_minor when CHAMIA-CURRENCY is signed
}
```

Migration script: write `scripts/migrate-sanity-paypal-to-kp.ts` that:

1. **GATE on CHAMIA-CURRENCY decision (§0.5 Day-0 hard gate):** branch on whether legacy `price` was KES major units or USD/multi-currency. If KES: `price_minor = price * 100`. If USD: `price_minor = price * fxRateUsdToKes * 100` per Chamia's FX rate decision.
2. For each existing `order` (none are real customers per §4.5; only dev/staging test orders): drop, OR tag with `legacy: 'paypal'`. New orders only use the new schema.
3. **Skip the legacy `shippingAddress` → `shipping_address` backfill** — text blobs cannot be auto-parsed reliably without geocoding. Specifically:
   - Free-text addresses like `"PO Box 12345, Kilimani, Nairobi"` have no `{lat, lng}` extractable without a geocoding API call (Google Maps Geocoding API, Mapbox, etc.) per-row.
   - For a real-customer dataset that's worth the spend, you'd write `scripts/backfill-shipping-geo.ts` that walks legacy orders, calls a geocoder, writes `shipping_address: { street, city, geo, label }` onto each row.
   - For UA's current state (no real customers per §4.5; only dev/staging test orders), the cost-benefit is wrong. **Drop legacy `order` documents during the CHAMIA-DATASET-CLEANUP pass (§0.5 Day-0 gate)** and start from a clean dataset.
   - If Chamia decides post-launch to import historical PayPal orders from another source (e.g. CSV export), the same geocoding pass applies — author at that point, not now.

### 4.4 Checkout flow — from PayPal popup to STK push

Old flow (PayPal):

```
Cart → <PayPalButtons> → /api/paypal/create-order → PayPal popup → user approves
→ /api/paypal/capture-order → write order to Sanity → /success
```

New flow (Kipkiren Pay STK push):

```
Cart → KipkirenPayCheckout (input phone or use Identiti session phone)
→ /api/checkout/initiate (POST: account_uuid, items, total_kes_minor, shipping_address)
   → server resolves phone_token from Identiti (or accepts existing customer JWT)
   → server calls KP /v1/charges/initiate with KES integer minor units
   → server returns { charge_id, state: "PENDING_PAYMENT" } to client
→ Client polls /api/checkout/status?charge_id=... every 3s for up to 90s
   OR listens to a Server-Sent Events stream
→ KP webhook PAYMENT_COMPLETED arrives at /api/payment-rail/webhook
   → server patches Sanity order to state='PAID', records kp_transaction_ref
   → server calls Itafika /v1/jobs to dispatch delivery
   → server calls Todoku /v1/messages/send for order_confirmed_sms
→ Client polling sees state='PAID' → redirect to /success
→ (Asynchronously) Itafika webhooks update Sanity order state through DISPATCHED → DELIVERED
   → Each transition fires a Todoku send (shipping_dispatched, delivery_imminent, delivery_completed)
```

**Critical UX consideration:** STK push has a 60s timeout on the customer's M-Pesa PIN entry. Build the checkout component with clear "Check your phone for the M-Pesa prompt" guidance + a "Retry" button after timeout.

### 4.6 Webhook idempotency store — DESIGN CALL (Vercel KV / Upstash Redis, NOT Sanity)

Webhook receivers run as Vercel functions — no persistent in-process state, often cold-start, multiple concurrent invocations on retry storms. Sanity is unsafe as a dedup store: writes are eventually-consistent (~200-800ms latency), and read-after-write is not guaranteed for ~1s per Sanity's CDN model. Two parallel webhook invocations (KP retries within 300ms is common; Itafika retries until 5xx) both see no dedup row, both write, both fire downstream. That's a double-charge / double-dispatch bug class.

**Pick one, before Week 2 Day 3:**

| Option | Pros | Cons |
|---|---|---|
| **Vercel KV** (recommended — built-in Redis-compatible KV) | One-click setup from Vercel dashboard. Atomic SET-with-NX. Built-in TTL. Free tier covers MVP volume. | Vendor-locked to Vercel deploy. |
| **Upstash Redis** | Same Redis semantics. Portable to non-Vercel deploys. Generous free tier. | One more vendor in the stack. |
| **Postgres add-on + row lock** | Familiar to anyone with Klokd / Lunch Drop / Itafika exposure. Transactional. | Heaviest setup; new database to operate. |

Recommendation: **Vercel KV**. Setup is `npx vercel kv create`, paste the env vars, install `@vercel/kv`, done. Key shape: `dedup:<rail>:<event_type>:<idempotency_key>` with `TTL=600s` (replay window + safety margin).

Sanity stays the order-document store of record; dedup is purely about not double-processing the same webhook event.

### 4.5 Customer-data migration

There IS no real PayPal customer data to migrate yet — per recap.md, the app is "largely content population" and "Status: largely content population, switching PayPal to live credentials, and replacing placeholder product UI" — meaning no real customers exist. **This makes the migration safe to do without a customer-state cutover plan.** If real customers WERE in place, you'd need a re-onboarding email/SMS flow asking them to create Identiti accounts.

---

## 5. Per-rail consumption matrix

| Capability | Identiti | Kipkiren Pay | Todoku | Itafika | Hakken (P2) | Helpan (P2) |
|---|---|---|---|---|---|---|
| `client.ts` (outbound HMAC) | ✓ | ✓ | ✓ | ✓ (asymmetric) | ✓ (header pair) | ✓ |
| `webhook.ts` (inbound) | ✗ (Kafka today; HTTP at ID-14 Phase 2) | ✓ — **MAIN LOOP** | ✓ | ✓ — **MAIN LOOP** | ✗ (events via Todoku outbox) | ✓ (for action dispatch inbound) |
| New tenant / anchor / plugin | `unique_accessories_sandbox` (Identiti) | `unique_accessories` KP account_uuid (tier_3 corporate) | `unique_accessories` external tenant + 8 templates + sender ID `UAKE` | `unique_accessories` anchor (operator-seeded) | `unique_accessories_v1` plugin (operator) | `helpan-unique-accessories-v1` agent (operator) |
| Operator request needed | ✓ | ✓ | ✓ | ✓ | ✓ (Phase 2) | ✓ (Phase 2) |
| Money Rule applies | ✗ | ✓ (everywhere) | ✗ | ✓ (webhook.ts only) | ✗ | ✗ |
| Test estimate (unit + smoke) | ~12 + 1 | ~15 + 1 (the most invasive) | ~10 + 1 | ~12 + 1 | ~10 + 1 (P2) | ~10 + 1 (P2) |

---

## 6. Pre-flight checklist (run before opening any source file)

### 6.1 Confirm rail-side state — expect 3 of 4 health checks pass

- [ ] Identiti production: `curl https://identiti-production.up.railway.app/v1/health` → 200 (Railway URL, custom domain not cut over)
- [ ] **KP production: NOT EXPECTED TO RESPOND** — `pay.kipkiren.co.ke` does not exist; KP-1-Ops Railway deploy still outstanding per master RECAP §8 item 10. Skip this check; track via master RECAP.
- [ ] Todoku production: `curl https://todoku-prod-production.up.railway.app/v1/health` → 200
- [ ] Itafika production: `curl https://itafika-production.up.railway.app/v1/health` → 200
- [ ] Read master RECAP at `c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md` §1.3 (every rail row) + §5 (critical path) + §8 (operator items) end-to-end
- [ ] Read Klokd's `KMV_RAILS_INTEGRATION_GUIDE.md` (871 lines) end-to-end — this is your authoritative wire-format reference, OVERRIDES any operator pack where they conflict. **Mirror it to `docs/KMV_RAILS_INTEGRATION_GUIDE.md` at Week 1 Day 1** so this app's bootstrap isn't coupled to Klokd's repo state.

### 6.2 Confirm credentials and tenant provisioning

- [ ] **Operator request to Silvia** sent for: Identiti `unique_accessories_sandbox` tenant + HMAC secret + Identiti customer-JWT issuance with `aud=unique_accessories` (and `aud=hakken` for Phase 2)
- [ ] Operator request: KP corporate `account_uuid` (tier_3) for Unique Accessories Ltd, + `PAYMENT_RAIL_APP_SECRET` + `PAYMENT_RAIL_WEBHOOK_SECRET`
- [ ] Operator request: Todoku `unique_accessories` tenant + 8 template ULIDs + sender ID `UAKE` (2–4 week regulatory lead time)
- [ ] Operator request: Itafika `unique_accessories` anchor seeded + `ITAFIKA_APP_SECRET` (64-char hex)
- [ ] Confirm Itafika OPS-6 (Railway billing) does NOT block your dev work — you can write client against the currently-deployed dev image
- [ ] Confirm CHAMIA-ENTITY decision: legal entity "Unique Accessories Ltd" (or similar) formalisation date — needed before KP tier_3 corporate account can be created

### 6.3 Baseline

- [ ] `npm install` clean
- [ ] `npm run build` clean (PayPal-included baseline)
- [ ] `npm run lint` clean
- [ ] `git status` clean — start integration work from a known-clean tree, not a half-finished change
- [ ] Read Klokd's `docs/HAKKEN_INTEGRATION_RESULT.md` for the most recent example of what "a result doc looks like at end of Phase 1"

### 6.4 Confirm decisions queued at Chamia

- [ ] **CHAMIA-CURRENCY:** product prices in Sanity were unmarked currency — confirm baseline is KES (not USD). Affects schema migration in §4.3.
- [ ] **CHAMIA-LOGISTICS:** confirm Unique Accessories will use Itafika for last-mile (vs. self-managed riders, vs. partnerships with G4S / Glovo / etc.). Cardinal Rule says use the rail; flagging because Phase 1 build effort matters.
- [ ] **CHAMIA-AUTH:** anonymous express checkout (creates tier-0 Identiti account on-the-fly) vs. account-required (forces signup before checkout). Recommend anonymous express + account upsell post-purchase.

---

## 7. Work plan — 5 weeks, phased

This is a fresh integration from scratch. Not a 3-day rhythm like Klokd's per-rail sprints — closer to 5 weeks total across all 4 Phase 1 rails plus PayPal removal.

### Week 1 — PayPal removal + Identiti foundation

**Day 1 (Authority + branch hygiene):**
- Read all authority docs in §1
- Author `docs/PAYPAL_REMOVAL_RUNBOOK.md` listing every file to delete + every env var to purge + the customer comms plan (none needed — no real customers yet)
- Branch: `feat/rail-integration-phase-1`
- Inventory existing PayPal code (`git ls-files | grep -i paypal`), commit a baseline snapshot tag `pre-rail-integration`

**Day 2–3 (Identiti client + auth flows):**
- Scaffold `lib/rails/identiti/client.ts` (server-only, mirror Klokd's `IdentityRailClient` pattern from `KMV_RAILS_INTEGRATION_GUIDE.md`)
- Wire `POST /v1/customers` (signup) + `POST /v1/auth/customer-token` (login) + `POST /v1/phone-tokens/resolve` (delivery contact) + `POST /v1/stepup/challenges` + `POST /v1/stepup/verify`
- Replace `use-shopping-cart`'s anonymous mode with a `<CartProvider>` that hydrates from a server action calling Identiti for the current user (or null if anonymous)
- Author `app/login/page.tsx` + `app/signup/page.tsx` (server actions; client-side form via shadcn/ui)
- 12 unit tests + 1 integration smoke (`scripts/smoke-identiti.ts`)
- Mock Identiti server for local dev (per Klokd's mock pattern)

**Day 4–5 (PayPal removal):**
- Delete every file listed in §4.1
- Remove `@paypal/react-paypal-js` from `package.json`
- Purge PayPal env vars from `.env.example`, `.env`, and any Vercel/deploy config
- Update Sanity `order` + `product` schemas per §4.3 (additive — keep legacy fields during transition)
- Update `app/components/Providers.tsx` to remove `<PayPalScriptProvider>` and add the Identiti `<AuthProvider>` (lightweight client wrapper that reads the current session)
- `npm run build` + `npm run lint` must stay clean
- Write `docs/PAYPAL_REMOVAL_RESULT.md`

### Week 2 — Kipkiren Pay (the most invasive replacement)

**Day 1–2 (KP client + money helpers):**
- Scaffold `lib/rails/payment-rail/client.ts` (mirror Klokd's `PaymentRailClient` from `KMV_RAILS_INTEGRATION_GUIDE.md`)
- Author `lib/rails/payment-rail/money.ts` with helpers: `kesMinorToMajor`, `kesMajorToMinor`, `formatKes` (NEVER floats; integer minor units only per AD-K07)
- Wire `POST /v1/charges/initiate` + `GET /v1/charges/{id}` + `POST /v1/payouts` + `POST /v1/holds`
- 8 unit tests for the client (HMAC, idempotency, KES validation, money helpers)
- **Sub-agents OK for the client.ts.** Money Rule applies to webhook.ts (next).

**Day 3 (KP webhook receiver — MAIN LOOP):**
- Hand-write `lib/rails/payment-rail/webhook.ts`
- Signature verify constant-time **before JSON.parse**
- Replay window 300s
- Dedupe on `(event_type, kp_transaction_ref)` — store in Sanity sub-document or a small `webhook_dedup` schema
- Handle: `WALLET_CREDITED` (audit only), `PAYMENT_COMPLETED` (patch order to PAID + trigger Itafika dispatch + trigger Todoku confirmation send), `PAYMENT_FAILED` (patch order to FAILED + surface to customer), `PAYOUT_COMPLETED` (refund landed — patch + notify), `PAYOUT_FAILED`
- 6 unit tests covering all 5 event types
- **No sub-agents on this file.**

**Day 4–5 (checkout flow rebuild):**
- Author `app/api/checkout/initiate/route.ts` (POST handler)
- Author `app/api/checkout/status/route.ts` (GET handler for polling)
- Author `app/components/KipkirenPayCheckout.tsx` (client, replaces `CheckoutNow.tsx`)
  - Phone-token input (or pull from Identiti session if logged in)
  - "Pay with M-Pesa" button → POST /api/checkout/initiate → display "Check your phone for the M-Pesa prompt" + 90s countdown + retry option
  - SSE or polling for status (charge_id → `PENDING_PAYMENT` → `PAID`)
  - On `PAID`: clear cart, redirect to `/success`
- Wire `app/success/page.tsx` to show order details from Sanity (kp_charge_id-keyed)
- 1 integration smoke (`scripts/smoke-payment-rail.ts`)
- Write `docs/KP_INTEGRATION_RESULT.md`

### Week 3 — Todoku (comms)

**Day 1 (Todoku client):**
- Scaffold `lib/rails/todoku/client.ts` (mirror Klokd's `TodokuClient` — message_id `01KTRPQ4X92VDD25PEY8RJZSW0` confirmed live on first send)
- Author `lib/rails/todoku/templates.ts` with the 8 template ULIDs as locked constants
- 6 unit tests

**Day 2–3 (wire sends to event triggers):**
- KP `PAYMENT_COMPLETED` webhook → Todoku `order_confirmed_sms` + `order_confirmed_whatsapp`
- Itafika `job.assigned` → Todoku `shipping_dispatched_sms`
- Itafika `job.delivered` → Todoku `delivery_completed_sms` (+ optional review request)
- KP `PAYOUT_COMPLETED` (refund) → Todoku `refund_initiated_sms`
- Phone-token resolution: pull from Identiti server-side (never raw MSISDN in any of these calls)
- Wire idempotency: `idempotency_key = "ua_<order_id>_<event_type>"` (deterministic per business operation)
- 6 unit tests for the trigger wiring

**Day 4 (marketing comms — class_2 templates):**
- Cart abandonment job: cron-style worker that scans Sanity for `cart` documents idle > 24h and sends `cart_abandonment_whatsapp` via Todoku bulk send
- Restock notification: when a Sanity `product.inStock` flips false→true, send `restock_notification_whatsapp` to customers who marked the product (Sanity `wishlist` sub-doc)
- **Note:** these depend on Hakken Phase 2 if you want cross-app restock discovery; for MVP, single-app scope is fine
- 4 unit tests

**Day 5 (smoke + result doc):**
- `scripts/smoke-todoku.ts` — full pipeline: phone token resolve → send confirmation → poll status
- Write `docs/TODOKU_INTEGRATION_RESULT.md`

### Week 4 — Itafika (last-mile delivery)

**Day 1–2 (Itafika client — asymmetric HMAC + bodyless GET gotcha):**
- Scaffold `lib/rails/itafika/client.ts` with **base64 outbound** HMAC
- **CRITICAL Day-1 test:** bodyless GET signs empty Content-Type AND sends no Content-Type header (constant on GET → 401). Bake this from day 1.
- Wire `POST /v1/jobs/quote`, `POST /v1/jobs`, `GET /v1/jobs/{job_id}`, `POST /v1/jobs/{job_id}/cancel`
- 6 unit tests + 4 specifically for the asymmetric/bodyless-GET behaviour
- Sub-agents OK for the outbound client

**Day 3 (Itafika webhook receiver — MAIN LOOP):**
- Hand-write `lib/rails/itafika/webhook.ts`
- **Hex** HMAC verify of `"<timestamp>.<rawBody>"` constant-time **before JSON.parse**
- 300s replay window
- Dedupe on `(job_id, event)`
- Handle 5 events: `job.assigned`, `job.picked_up`, `job.delivered`, `job.failed`, `job.cancelled`
- On `job.delivered`: patch Sanity order to DELIVERED + commit delivery-fee reconciliation against the KP statement (Itafika charges your KP account internally — verify reconciliation matches expected delivery fee from the original quote)
- 8 unit tests + 1 integration smoke (`scripts/smoke-itafika.ts`)
- **No sub-agents on this file** — payment-adjacent.

**Day 4 (checkout integration — show delivery fee + quote on cart):**
- On cart view: if shipping_address geo is set, call `POST /v1/jobs/quote` to display delivery fee inline (or show "Delivery fee will be calculated at checkout" if not)
- On checkout initiate: include `delivery_fee_kes_minor` in the total passed to KP (the customer pays both product + delivery in one STK push)
- After `PAYMENT_COMPLETED`: call `POST /v1/jobs` to dispatch (anchor_reference_id = your order_id)
- 4 unit tests

**Day 5 (smoke + result doc):**
- Full pipeline smoke: cart → checkout → KP charge → Itafika dispatch → 5 webhook events → Sanity order state machine
- Write `docs/ITAFIKA_INTEGRATION_RESULT.md`

### Week 5 — Phase 1 hardening + Phase 2 scoping

**Day 1–2 (cross-rail consistency + hardening):**
- Audit log discipline: every rail call writes a `rail_audit` entry to the Sanity order document with `(rail, action, request_id, traceparent, business_op_id, timestamp, success, error_code?)` — §A.11 invariant verified end-to-end
- Run the adversarial-verify workflow against your work (per Klokd's pattern that caught 2 critical + 4 major bugs on the cross-cutting playbook)
- 4-lens audit: Identiti claims, KP claims, Itafika claims, cross-rail consistency

**Day 3 (test count baseline + tech debt sweep):**
- Total target: ~50–60 tests across 4 rails + integration + money helpers
- Get `npm test` to a green baseline; address any failures from the PayPal removal
- Document tech debt in `docs/RAIL_INTEGRATION_RESULT.md` §tech-debt

**Day 4 (Phase 2 scoping):**
- Hakken: design `unique_accessories_v1` plugin (file an operator request to Silvia with the plugin design — broadcast types, ranking weights, entity types)
- Helpan AI: design `helpan-unique-accessories-v1` agent (file an operator request with the agent design — scopes, matchers, audience posture)
- Defer both to Phase 2 work that depends on operator action

**Day 5 (deploy + monitor):**
- Deploy to Vercel production with all rail env vars
- Watch first 5 real orders end-to-end (Identiti signup → KP STK push → Todoku confirmation → Itafika dispatch → delivery webhooks)
- Write Phase 1 close-out section in `docs/RAIL_INTEGRATION_RESULT.md`

---

## 8. Hard rules (non-negotiable)

- **No emojis** in code, commits, docs.
- **No `Co-Authored-By: Claude` / "Generated with Claude Code" trailers** in commits.
- **KES integer minor units only** for monetary values. Never floats; never major units in API calls; never `currency: 'KES'` as a wire field for Hakken (banned key).
- **Never call PayPal** after this work lands. No PayPal env vars. No PayPal dependencies.
- **Never call Daraja directly.** Only via KP.
- **Never call Africa's Talking / Twilio / WhatsApp Business API.** Only via Todoku.
- **Never store raw MSISDN, National ID images, biometric vectors, KRA PIN images.** Identiti is the source of truth for identity.
- **Money Rule:** payment-touching code (`lib/rails/payment-rail/webhook.ts`, `lib/rails/itafika/webhook.ts`, delivery-fee reconciliation, refund flow) stays in the MAIN LOOP. Sub-agents OK for the rest.
- **Hakken §10.7 banned-key wall** (Phase 2): `amount`, `currency`, `funds`, `credit`, `transfer`, `disburse`, `debit`, `refund`, `withdraw`, `deposit`, `money`, `balance`, `settlement`, `commission`, `ledger`, `kes_amount`, `usd_amount`, `monetary_value`, `source_payment*` rejected at any depth. Use `price_range_kes: [50, 5000]`.
- **Hakken PII wall:** no MSISDN / email / two-word names / literal name fields.
- **Hakken JWT** requires `aud=hakken` (Phase 2).
- **Itafika asymmetric HMAC:** base64 out, hex in. Bodyless GET = empty Content-Type, no header sent.
- **§A.11 traceparent + business_op_id** on every audit row (= order_id for KP, shipment_id for Itafika).
- **AD-K06**: Payment rail base URLs from env vars only. Never hardcoded. Especially relevant when LipaStack transcends KP (Phase 3) — `PAYMENT_RAIL_API_BASE` flip with no code change.
- **Confirm scope before significant changes.** Treat "proceed" as full authorization.

---

## 9. Hard blockers (operator-gated)

Mirrors and elevates master RECAP §8 operator items into UA's view, in priority order.

| # | Blocker | Who | Effect |
|---|---|---|---|
| 1 | **3 stale Identiti integrator HMAC secrets** (`lunchdrop_sandbox` 20d, `itafika_sandbox` 18d, `klokd_sandbox` 14d as of 23 June) — your `unique_accessories_sandbox` secret will be the 4th in line | Silvia | The **platform-wide critical block** per master RECAP §8 item 1. Until at least one delivery cascade clears, no consumer-app rail integration goes live. |
| 2 | **Itafika OPS-6 Railway billing** (trial expired) | Silvia | Does NOT block your dev work (dev image reachable). DOES block any Itafika rail-side redeploy + production cutover. Per master RECAP §8 item 2. |
| 3 | **Identiti customer-JWT issuance for `aud=hakken`** — **Phase-1 DESIGN-TIME block, not Phase-2-only** | Silvia (~30-min spec) | The Identiti `/v1/auth/customer-token` endpoint shape determines whether multi-audience minting is possible. Even if Phase 2 Hakken work is months away, the Identiti spec needs to be filed at Day 0 so the customer-token endpoint is shape-correct in Week 1. Per master RECAP §8 item 3 ("NEW critical bottleneck"). |
| 4 | **Identiti staging cutover** (paste-ready since 15 May — still unpressed) | Silvia | Affects whether sandbox JWTs are real or stub. Per master RECAP §8 item 4. |
| 5 | **OPS-4** (KP `itafika_sandbox` provisioning) + **OPS-5** (Todoku creds 1Password retrieval) | Silvia | Affects whether Itafika's KP-16 delivery-fee charging is live or inert. Per master RECAP §8 item 5. |
| 6 | **CHAMIA-1** (Sabakifresh anchor-sequencing memo — unsigned, blocks Itafika IT-S6) | Chamia | Indirect — but Itafika operator queue scheduling depends on it. Per master RECAP §8 item 6. |
| 7 | **Itafika eu-west-2 → eu-west-1 region re-provisioning** | Silvia / decision | Functional impact on UA: none today. Stage 2 cutover impact: yes. Per master RECAP §8 item 7. |
| 8 | **`HAKKEN_APP_SECRET` for `app_slug=unique_accessories`** (Phase 2) | Silvia | Hakken integration blocked. |
| 9 | **Helpan operator handover** — `HELPAN_API_BASE` + `HELPAN_APP_SECRET` + `HELPAN_WEBHOOK_SECRET` (Phase 2) | Silvia | Helpan integration blocked. Per master RECAP §8 item 9. |
| 10 | **KP-1-Ops Railway deploy** — activates UA's payment integration end-to-end | Silvia | Per master RECAP §8 item 10. |
| — | UA-specific operator requests (file at Week 1 Day 1) | Silvia | `unique_accessories_sandbox` Identiti tenant + JWT issuance with `aud=unique_accessories` AND `aud=hakken` shape design · KP corporate `account_uuid` (tier_3, gated on CHAMIA-ENTITY) + `PAYMENT_RAIL_APP_SECRET` (base64url-43) · Todoku `unique_accessories` tenant + 8 template ULIDs + sender ID `UAKE` (2-4 week CA-K lead time — file early) · Itafika `unique_accessories` anchor seed + `ITAFIKA_APP_SECRET` (hex-64) · CHAMIA-CURRENCY / CHAMIA-LOGISTICS / CHAMIA-ENTITY decisions (per §0.5 Day-0 gates) |
| — | UA's anchor will be 4th in Silvia's queue (after the 3 stale HMACs) | Silvia | **Week 4 Itafika work assumes Silvia clears at least one delivery cascade by Week 2** — otherwise Week 4 slips. File the operator request in Week 1 Day 1, not Week 4 Day 1. |

---

## 10. Cross-reference

- `c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md` — master cross-rail tracker (23 Jun)
- `c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\Sprint_Backlog_v1_0.html` — visual sprint tracker
- `c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\Platform_Rails_Reboot_Pack_v1_3.md` — six-rail framing
- `C:\Projects\Klokd\KMV_RAILS_INTEGRATION_GUIDE.md` — **authoritative wire-format reference (871 lines)** for Identiti / KP / Todoku / Helpan AI; overrides operator packs where they conflict
- `C:\Projects\Klokd\docs\HAKKEN_INTEGRATION_REFERENCE.md` — Hakken wire contract
- `C:\Projects\lunch drop\docs\ITAFIKA_INTEGRATION_REFERENCE.md` — Itafika wire contract (secret-free mirror of rail-side commit `24ac829`)
- `C:\Projects\Klokd\docs\HAKKEN_ITAFIKA_INTEGRATION_PLAYBOOK.md` — cross-cutting Hakken+Itafika patterns (mirrors at canonical platform-rails folder)
- `C:\Projects\Klokd\RECAP.md` — Klokd v3 RECAP (v1.2, 23 Jun) — best example of "a consumer app rail-integration result doc"; mirror this for Unique Accessories' own RECAP
- `C:\Projects\Klokd\docs\HAKKEN_INTEGRATION_RESULT.md` — what a per-rail result doc looks like
- Local (will exist post-Phase-1): `docs/PAYPAL_REMOVAL_RUNBOOK.md`, `docs/PAYPAL_REMOVAL_RESULT.md`, `docs/KP_INTEGRATION_RESULT.md`, `docs/TODOKU_INTEGRATION_RESULT.md`, `docs/ITAFIKA_INTEGRATION_RESULT.md`, `docs/RAIL_INTEGRATION_RESULT.md`, `RECAP.md`, `STARTUP_RAIL_INTEGRATION.md`

---

*KMV Platform Rails · Unique Accessories Rail Integration Playbook · 23 June 2026 · Confidential*
