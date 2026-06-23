# Operator Request — Todoku tenant + 8 templates + sender ID for Unique Accessories

**To:** Silvia Mumbua (CTO · Kipkiren Teknolojia · Todoku rail operator)
**From:** Unique Accessories engineering · Chamia Mutuku (CEO · KMV) · authored 23 June 2026
**Authority:** cite docs/RAIL_INTEGRATION_PLAYBOOK.md §3.3 (Todoku per-rail summary) + §2.3 (env-var encodings) + §2.4 (shared HMAC) + docs/KMV_RAILS_INTEGRATION_GUIDE.md §5 (Todoku full spec, field-name traps, anti-impersonation copy, sandbox gap) + §0–§3 (universal HMAC facts) + master RECAP §8 (23 Jun 2026 — stale-secret queue + open operator gates)
**Status:** 🟠 BLOCKED on operator action — sender ID `UAKE` carries a 2–4 week Communications Authority of Kenya (CA-K) regulatory clock; this is filed Week 1 Day 1 (NOT Week 3) so that clock starts now and is not the long-pole at production cutover.
**Estimated operator effort:** ~30 min provisioning (tenant + secrets) + ~3–7 day template review cycle + ~2 h CA-K sender-ID filing
**External lead time:** sender ID `UAKE` — **2–4 weeks CA-K regulatory** (start IMMEDIATELY); WhatsApp templates (2 of 8) add 24–72 h Meta approval, run in parallel

---

## 0. Why this / sequencing

Todoku consumes an Identiti `phone_token` (audience=todoku) on **every** send — `recipient_token` is never a raw MSISDN. So Identiti must be provisioned first; this request **depends on `OPERATOR_REQUEST_IDENTITI.md`** (filed same day). That ordering is logical only — do NOT wait on Identiti to start the Todoku items below, because the long-pole here is regulatory, not technical.

⚠ **FILE EARLY — the regulatory clock is the reason this is Operator Request 3/4 at Week 1 Day 1.** The sender ID `UAKE` requires a Communications Authority of Kenya (CA-K) filing with a **2–4 week** lead time. Everything else (tenant, secrets, template ULIDs) is ~30 min to days; the sender ID is the only item that can slip the production cutover if not started now. Per master RECAP §8 (23 Jun 2026), UA's `unique_accessories_sandbox` Identiti secret is **4th in the stale-secret operator queue** (behind `lunchdrop_sandbox` 20d, `itafika_sandbox` 18d, `klokd_sandbox` 14d) — these requests are batched Week 1 Day 1 precisely to get UA into that queue.

| Sub-action | Operator effort | Lead time | Blocks |
|---|---|---|---|
| Provision `unique_accessories` tenant + return secrets | ~30 min | none | All Todoku send work — start here |
| Review + approve 8 templates (request a ULID per template) | ~3–7 days review + 24–72 h Meta per WhatsApp template | none beyond review | Production send (sandbox send works pre-approval via synthesized token — see §7) |
| Register sender ID `UAKE` (+ fallback) with CA-K | ~2 h operator filing | **2–4 weeks regulatory** | Branded production sends; sandbox uses platform-default sender |

The template-approval and sender-ID sub-actions run in parallel after the tenant is provisioned. File the sender ID without waiting for either of the other two.

---

## 1. The ask — sandbox tenant + 8 template ULIDs + sender ID registration

Provision an **external-billed** `unique_accessories` tenant on the Todoku rail (LIVE on Railway at `https://todoku-prod-production.up.railway.app`; TD-0..TD-9 + TD-12..TD-14 closed, 250/250 tests, 6 tenants already live — `sandbox` + `itafika` + `kws` + `hakken_internal` + `lipastack` + `klokd_sandbox`). Mirror that existing tenant pattern.

**App identity:**

| Field | Value |
|---|---|
| `app_slug` | `unique_accessories` |
| `app_name` | Unique Accessories |
| `legal_entity` | "Unique Accessories Ltd" — **TBD — CHAMIA-ENTITY** (registration date not yet set; gates KP corporate tier_3, not this Todoku tenant) |
| `vertical` | e-commerce / physical-goods retail (accessories) |
| `audience_posture` | `general_consumer` |
| `regulator_exposure` | CA-K (sender-ID + bulk-SMS consent) + DPA 2019 (recipient is a phone-token, never a stored MSISDN — see §5) |
| `sandbox_mode` | true |

**Tenant identity (Todoku rows):**

| Field | Value |
|---|---|
| `tenant_slug` | `unique_accessories` |
| `tenant_name` | Unique Accessories |
| `tenant_class` | **`external_billed`** (per docs/RAIL_INTEGRATION_PLAYBOOK.md §3.3 — UA is a billed consumer app, NOT internal-bypass like Kipkiren Pay / Sabaki / Sauti; messaging cost is a real line item — confirm published external rate before dev integration so unit economics match) |
| `expected_volume_band` | **TBD — CHAMIA-VOLUME** (transactional band = orders/day × ~4 lifecycle messages; marketing band separate; not yet sized) |
| `default_sender_id` | `UAKE` (pending CA-K approval — see sender-ID sub-action below) |
| `fallback_sender_id` | **TBD — CHAMIA-SENDER-FALLBACK** (proposed `UAccess` (7) if a separate sender is wanted for class_2 marketing; lock at filing time — a later change re-triggers the 2–4 week CA-K clock) |
| `webhook_callback_base` | **TBD** — UA's deployed Vercel URL once Phase-1 cutover lands (`https://<ua-app>/api/todoku/webhook`) |
| `envelope_limits` | **TBD** — platform-default at MVP; no tenant-specific overrides requested |
| `sandbox_mode` | true |

**Sender ID — `UAKE` (4 chars; CA-K allows 3–11 alphanumeric):** "U"+"A"+"KE" (country tag). Short, brand-tagged, customer-visible on every SMS so it doubles as ambient brand surface, and matches the 4-char pattern most KMV apps converge on (Klokd chose `Klokd` (5) + fallback `KlokdOTP` (8)). File this with CA-K + Safaricom/Airtel + DPA 2019 declaration immediately. Until approved, sandbox sends use whatever platform-default sender Todoku assigns at provisioning.

---

## 2. Env vars

Return these four after provisioning. UA's env loader validates presence + encoding shape and throws `RAIL_CONFIG_INCOMPLETE: todoku` (missing) or `RAIL_CONFIG_BAD_ENCODING: todoku.APP_SECRET` (wrong shape) — so the encoding below is load-bearing.

| Env var | Value | Notes |
|---|---|---|
| `TODOKU_API_BASE` | `https://todoku-prod-production.up.railway.app` | Actually-deployed Railway URL (no custom domain yet). Validate `GET <base>/v1/health` → 200 before UA writes a line of client code. ⚠ Paste the deployed URL, not a Railway dashboard placeholder (Identiti burned 30 min on exactly this per guide §1). |
| `TODOKU_APP_ID` | `unique_accessories` | Goes inside the `Authorization: Todoku-HMAC-SHA256 app_id=…` header. Tenant identity is derived from this — ⚠ do NOT expect or require an `X-Todoku-Tenant` header (see §5). |
| `TODOKU_APP_SECRET` | `<base64url-43>` | ⚠ **base64url, 43 chars, no padding** — NOT hex-64. (Identiti is hex-64; Todoku + KP are base64url-43. Delivering hex here makes every signature 401.) `crypto.createHmac` consumes the secret as-is; the canonical produces a **base64** outer signature (guide §2 + §0 fact 1). Deliver via 1Password. |
| `TODOKU_WEBHOOK_SECRET` | `<base64url-43>` | ⚠ **base64url, 43 chars, no padding** — same encoding as the app secret. Verifies inbound delivery-receipt webhooks (see §6). Deliver via 1Password. |

DEFERRED (none deferred for Todoku — all four are needed Phase 1 and are unblocked once the tenant is provisioned). For contrast with the sibling rails: ~~`IDENTITI_WEBHOOK_SECRET`~~ **DEFERRED** (Identiti is Kafka-only until ID-14) and ~~`PAYMENT_RAIL_WEBHOOK_SECRET`~~ **DEFERRED** (KP has no HTTP webhook signer yet) — those live in their own operator requests, listed here only so Silvia does not conflate them with Todoku's secrets, which ARE due now.

---

## 3. Granted scopes

No granular Todoku scope model applies at the tenant level — access is gated by `tenant_class` (`external_billed` here), not per-resource scopes. The only scope worth naming is the negative one: ⚠ **`phone_token:resolve` must NOT be granted to UA.** `/v1/phone-tokens/resolve` is a Todoku-internal endpoint; an app that holds that scope (or calls that path) gets 403. UA mints phone tokens via Identiti `POST /v1/phone-tokens` (audience=todoku) and passes the opaque token as `recipient_token` — UA never resolves it.

---

## 4. Authentication — per-request HMAC

Per docs/KMV_RAILS_INTEGRATION_GUIDE.md §0–§2, Todoku shares the universal KMV signer. The **outer signature is BASE64** (not hex); the **body hash inside the canonical is hex**; the path is signed **with** the `/v1/` prefix.

Authorization header (bodied request):

```
Authorization: Todoku-HMAC-SHA256 app_id=unique_accessories, signature=<base64>
X-Todoku-Timestamp: 2026-06-23T09:15:00.000Z
Content-Type: application/json; charset=utf-8
X-Idempotency-Key: <UUIDv4>
```

Canonical signing string — exactly 5 lines joined by `\n`:

```
{METHOD}
{PATH_AND_QUERY}            # e.g. /v1/messages/send — WITH the /v1/ prefix
{CONTENT_TYPE}             # 'application/json; charset=utf-8' for bodied; EMPTY STRING for GET
{TIMESTAMP}               # RFC 3339, e.g. new Date().toISOString()
{SHA256_HEX(rawBody)}    # hex digest of the raw body; '' hashed for GET
```

⚠ **GET trap:** for `GET /v1/messages/{id}` sign the **empty string** as Content-Type AND send **no** `Content-Type` header. Signing the literal `application/json` on a GET returns 401 (the gotcha that bit Identiti). ⚠ **Body-hash-vs-signature trap:** the inner SHA-256 of the body is **hex**, but the final HMAC output is **base64** — mixing these is the most common first-smoke 401.

- **Replay window:** 300 s — timestamp must be within 5 min of Todoku's clock.
- **Idempotency:** `X-Idempotency-Key` is a fresh UUIDv4 on every write (`/v1/messages/send`, `/v1/messages/send-bulk`); Todoku persists it 24 h. Note the **separate** body-level `idempotency_key` field (§5) — both are sent on a send.
- **Client file path:** `app/lib/rails/todoku/client.ts` (uses the shared signer at `app/lib/rails/_shared/signRequest.ts`; ULIDs locked in `app/lib/rails/todoku/templates.ts`). All route handlers importing it MUST declare `export const runtime = 'nodejs'` — `crypto.createHmac` is not available on the Edge runtime.

---

## 5. Endpoints this app will call

| Verb | Path | Purpose |
|---|---|---|
| POST | `/v1/messages/send` | Single templated send — transactional order/shipping/refund lifecycle (class_1) |
| POST | `/v1/messages/send-bulk` | Batched send — marketing (cart abandonment, restock alerts; class_2) |
| GET | `/v1/messages/{id}` | Delivery status read (⚠ GET = empty Content-Type, no header — see §4) |
| GET | `/v1/messages/{id}/events` | Delivery timeline (optional) |
| GET | `/v1/templates` | List approved templates + their ULIDs for this tenant (use to confirm the ULIDs handed back in §1) |
| GET | `/v1/health` | Unauth health check — run before client code |

**Send body — exact field names (⚠ every one of these is a trap; a wrong key returns `400 additionalProperty`):**

```json
{
  "recipient_token": "<Identiti phone_token JWT, audience=todoku>",
  "template_id": "<26-char Crockford ULID>",
  "channel": "sms",
  "template_variables": { "order_ref": "ua_order_1042", "eta": "today 4pm" },
  "idempotency_key": "<UUIDv4>"
}
```

- ⚠ `recipient_token` — the Identiti **phone_token JWT**, NOT `phone_token`, NOT `recipient`, NOT `to`, and NEVER a raw MSISDN.
- ⚠ `template_id` — the **ULID** Silvia returns per template (§1), NOT the slug.
- ⚠ `channel` — **required**: one of `"sms" | "whatsapp" | "voice" | "in_app"` (not derived from the template class).
- ⚠ `template_variables` — an **object**, NOT `params`, NOT `variables`, NOT `vars`.
- ⚠ `idempotency_key` — body-level UUIDv4 (in addition to the `X-Idempotency-Key` header from §4).
- ⚠ **Do NOT send an `X-Todoku-Tenant` header** — tenant identity comes from `app_id` in the Authorization header; the rail ignores the header but it is misleading.

**Phone tokens (the recipient_token source):** ALWAYS minted via Identiti `POST /v1/phone-tokens` with `audience: 'todoku'`, fresh per send (15-min freshness window — never cache). UA never stores or logs a raw MSISDN anywhere (Cardinal Rule AD-K03 + DPA 2019).

---

## 6. Webhook events / async delivery

Todoku webhooks are **active** (HTTP, signed) — unlike Identiti (Kafka) and KP (Kafka). UA registers `webhook_callback_base` once deployed (§1). Inbound receiver lands at `app/api/todoku/webhook/route.ts`.

- **Events:** `MESSAGE_SENT`, `MESSAGE_DELIVERED`, `MESSAGE_FAILED` (delivery receipts).
- **Signature:** verify with `TODOKU_WEBHOOK_SECRET` (base64url-43). ⚠ The webhook canonical is **different** from request signing — it is dot-delimited `{TIMESTAMP}.{NONCE}.{rawBody}`, base64 HMAC. Read raw bytes via `await req.text()` and verify constant-time **before** `JSON.parse` (`req.json()` parses the body before verify and defeats the compare).
- **Retry ladder:** 30 s → 5 min → 30 min → 6 h → 24 h, abandoned after 5 attempts. Dedupe on `(message_id, event)`; 300 s replay window.

---

## 7. Sandbox quirks

⚠ **Todoku sandbox rejects real Identiti sandbox JWTs** with `CHAN_PHONE_TOKEN_INVALID` (cross-rail coordination gap, escalation pending per guide §5). The sandbox only accepts `recipient_token` values prefixed `SANDBOX_TOKEN_DELIVER_OK_*`. For the Phase-1 smoke (UA → Identiti → Todoku full chain), UA will synthesize tokens locally:

```typescript
const sandboxToken = `SANDBOX_TOKEN_DELIVER_OK_${appSlug}_${userId}`;
// e.g. SANDBOX_TOKEN_DELIVER_OK_unique_accessories_42
```

**Ask:** confirm this is still the expected sandbox shim as of 23 Jun, and whether a sandbox-prefixed-token path from Identiti is now available (so the chain can be exercised end-to-end without the shim). Real Identiti JWTs are expected to work only once both rails cut over to production.

Other sandbox confirmations requested: (1) where do sandbox outbound messages land — a captured-message log in the Todoku portal, or a whitelisted receiver number? UA needs to know where to inspect outbound SMS during tests. (2) Confirm the platform-default sender ID assigned at provisioning, so sandbox sends are recognisable before `UAKE` clears CA-K.

---

## 8. App-side commitments (informational)

| Item | Owner | Status |
|---|---|---|
| `recipient_token` is an Identiti phone_token (audience=todoku), minted fresh per send | UA `app/lib/rails/todoku/client.ts` | ✅ designed — never cached beyond 15-min window |
| No raw MSISDN stored or logged anywhere (Cardinal Rule AD-K03 + DPA 2019) | UA engineering | ✅ committed — phone lives only as Identiti token namespace |
| No direct Africa's Talking / Twilio / WhatsApp Business API client | UA engineering | ✅ committed — all comms via Todoku |
| ULIDs locked as constants (placeholder→real swap on return) | `app/lib/rails/todoku/templates.ts` | ✅ scaffold uses `UNIQUE_ACCESSORIES_*_PLACEHOLDER`; sends to an unwired template fail loud, not silent |
| Body `idempotency_key` (UUIDv4) + header `X-Idempotency-Key` on every send | UA `client.ts` | ✅ built at scaffold |
| Anti-impersonation copy baked into all class_1 templates at submission | UA content | ✅ embedded (see §1 / template list below) — submitted with copy, not retro-fitted |
| Webhook receiver verifies raw bytes constant-time before JSON.parse | `app/api/todoku/webhook/route.ts` | ✅ designed — dot-delimited canonical, `runtime = 'nodejs'` |
| `notification_log` carries NO phone-number column | UA schema | ✅ keyed on `account_uuid` + `todoku_message_id` |

### 8.1 The 8 templates to provision (request a ULID for each)

UA authors the copy below; Silvia runs the standard approval flow and returns a stable 26-char ULID per template. ⚠ Todoku **auto-rejects** any class_1 payment/order template that does not embed the anti-social-engineering line — it is baked into each submission below, not added after a rejection. (No class_0 OTP template is in this set, so no anti-phishing line is required here; if an OTP template is added later it must carry one.)

| # | Template slug | Channel | Class | Mandatory embedded copy |
|---|---|---|---|---|
| 1 | `unique_accessories_order_confirmed_sms` | sms | class_1 (transactional) | "Unique Accessories will never ask you to share a code or your PIN." |
| 2 | `unique_accessories_order_confirmed_whatsapp` | whatsapp | class_1 | "Unique Accessories will never ask you to share a code or your PIN." (⚠ also needs Meta approval, 24–72 h) |
| 3 | `unique_accessories_shipping_dispatched_sms` | sms | class_1 | "Unique Accessories will never ask you to share a code or your PIN." |
| 4 | `unique_accessories_delivery_imminent_sms` | sms | class_1 | "Unique Accessories will never ask you to share a code or your PIN." |
| 5 | `unique_accessories_delivery_completed_sms` | sms | class_1 | "Unique Accessories will never ask you to share a code or your PIN." |
| 6 | `unique_accessories_refund_initiated_sms` | sms | class_1 | "Unique Accessories will never call you to reverse this transaction or ask for your M-PESA PIN." |
| 7 | `unique_accessories_cart_abandonment_whatsapp` | whatsapp | class_2 (marketing) | Standard class_2; opt-out line per CA-K bulk-SMS rules (⚠ Meta approval 24–72 h) |
| 8 | `unique_accessories_restock_notification_whatsapp` | whatsapp | class_2 (marketing) | Standard class_2; opt-out line per CA-K bulk-SMS rules (⚠ Meta approval 24–72 h) |

The 2 WhatsApp templates (#2, #7, #8 — three are WhatsApp) are submitted by Todoku to Meta on UA's behalf via Todoku's WhatsApp Business Account; sandbox send works pre-Meta-approval via the §7 token shim, production WhatsApp send waits on Meta.

---

## 9. Cross-reference

- UA playbook: [`docs/RAIL_INTEGRATION_PLAYBOOK.md`](./docs/RAIL_INTEGRATION_PLAYBOOK.md) §3.3 (Todoku per-rail — tenant + 8 templates + UAKE rationale) + §2.3 (per-rail secret encodings) + §2.4 (shared `signRequest()`) + §4.2 (`app/lib/rails/todoku/*` files to add)
- KMV guide: [`docs/KMV_RAILS_INTEGRATION_GUIDE.md`](./docs/KMV_RAILS_INTEGRATION_GUIDE.md) §0–§3 (universal HMAC: base64 outer / hex body-hash / `/v1/` prefix / 300 s / UUIDv4) + §5 (Todoku full spec — five field-name traps, anti-impersonation copy, `CHAN_PHONE_TOKEN_INVALID` sandbox gap) + §10 (operator-request deliverables checklist)
- Master RECAP: `c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md` §8 (23 Jun 2026 — stale-secret operator queue; UA is 4th) + §1.3 (Todoku row: 6 tenants live, 250/250, LIVE on Railway)
- Sibling precedents (Klokd's 5-file pattern): `C:\Projects\Klokd\OPERATOR_REQUEST_TODOKU.md` (canonical house-style template — Klokd's `klokd` tenant + 8 templates + `Klokd` sender ID), alongside `OPERATOR_REQUEST_IDENTITI.md` / `OPERATOR_REQUEST_KP.md` / `OPERATOR_REQUEST_HAKKEN.md` / `OPERATOR_REQUEST_HELPAN.md`
- Companion UA requests (same Week-1-Day-1 batch): `OPERATOR_REQUEST_CHAMIA.md` (signed Day-0 gates) · `OPERATOR_REQUEST_IDENTITI.md` (phone tokens — this request depends on it)

---

*Operator Request 3/4 · Todoku tenant + 8 templates + sender ID for Unique Accessories · 23 June 2026 · Confidential · BLOCKED on operator action — sender ID `UAKE` 2–4 week CA-K regulatory lead, FILE NOW · Depends-on: OPERATOR_REQUEST_IDENTITI.md (phone tokens)*
