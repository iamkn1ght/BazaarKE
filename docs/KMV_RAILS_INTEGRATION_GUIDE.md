# KMV Rails Integration Guide

**For:** Any consumer app integrating against Identiti / Todoku / Kipkiren Pay (and later Hakken / Helpan).
**Verified against:** live sandboxes, 2026-06-09 → 2026-06-10. Klokd is the reference integration.
**Authority:** This file overrides the operator-pack docs (`OPERATOR_REQUEST_*.md`) where they conflict with live rail behavior. The operator packs lag the rails.

If you are bootstrapping a new KMV consumer app, read this end-to-end first. It saves ~3 hours of wire-format discovery per rail.

---

## 0. The five facts that are true for every rail

1. **Auth = per-request HMAC-SHA256, BASE64 signature output.** Not hex. The operator packs and LD reference client both say hex for Identiti — they are wrong. The shared signing module `c:/Projects/platform-shared/dist/hmac.js` uses `digest('base64')` for every rail. Verified live.

2. **Canonical signing string is identical across rails:**
   ```
   {METHOD}\n{PATH_AND_QUERY}\n{CONTENT_TYPE}\n{TIMESTAMP}\n{SHA256_HEX(body)}
   ```
   Body hash inside the canonical is hex; only the outer HMAC is base64.

3. **All endpoints under `/v1/*` prefix.** The LD reference client signs paths without `/v1/` because the `baseUrl` in LD includes it. Live rails serve `/v1/...` paths and validate HMAC against that. Sign with `/v1/...` in the canonical.

4. **Response envelope is `{ok, data, meta}`** (success) or `{ok: false, error: {code, message, detail?, field?, documentation_url?}, meta}` (error). Always unwrap to `data` at the client boundary; never let raw rail responses leak into business logic.

5. **Idempotency keys (UUIDv4) are required on every write request.** Header name `X-Idempotency-Key`. Rails persist for 24h.

If a rail's behavior contradicts any of the above, treat it as a bug in the rail, not in your client.

---

## 1. Bootstrap checklist for a new app

Before writing any code, get these from the rail operator (Silvia for Identiti/Todoku/KP; rail-specific Claude sessions for the rest):

### Per rail (4 things × 3 rails = 12 values total for full integration)

| Rail | API base URL | App ID | App secret (encoding) | Webhook secret |
|---|---|---|---|---|
| Identiti | `https://identiti-production.up.railway.app` | `<yourapp>_sandbox` | hex-64 | DEFERRED (Kafka today; ID-14 Phase 2 ships HTTP webhooks) |
| Todoku | `https://todoku-prod-production.up.railway.app` | `<yourapp>_sandbox` | **base64url-43** (no padding) | base64url-43 |
| Payment Rail (KP) | ⏳ pending Railway deploy (KP-1-Ops) | `<yourapp>_sandbox` | base64url-43 (NOT hex-64; KP follows Todoku pattern, not Identiti) | TBD (KP has no HTTP webhook signer today — see §6 fork decision) |
| Hakken | TBD | TBD | TBD | TBD |

**URL trap:** Make the rail operator paste an actually-deployed URL, not a Railway project dashboard URL with `<Railway URL>` placeholder. Identiti burned 30 min on this. Validate with `GET <base>/v1/health` or `GET <base>/.well-known/jwks.json` (Identiti) returning 200 before proceeding.

### Per app (cross-rail config)

| Item | Source | Use |
|---|---|---|
| Account UUID prefix for your users (`acc_<...>`) | Identiti issues at customer-create | Primary FK on every worker/employer table |
| KP corporate account_uuid (tier_3) | KP via `scripts/onboard-account.ts --tier tier_3` | `from_corporate_account_uuid` for B2C payouts |
| Webhook receiver URL (your deployed app) | Your app | Register with each rail's operator console |
| Test MSISDNs | Identiti `+254700000005/6`; Todoku same; KP recommends `254708374149` (Safaricom universal sandbox) | Different rails have different test number policies |

### Env var naming convention (locked)

```env
# Pattern: <RAIL>_API_BASE / _APP_ID / _APP_SECRET / _WEBHOOK_SECRET
IDENTITI_API_BASE=...
IDENTITI_APP_ID=...
IDENTITI_APP_SECRET=...

TODOKU_API_BASE=...
TODOKU_APP_ID=...
TODOKU_APP_SECRET=...
TODOKU_WEBHOOK_SECRET=...

# Payment rail is rail-agnostic by name (LipaStack transcends KP at Phase 3)
PAYMENT_RAIL_API_BASE=...
PAYMENT_RAIL_APP_ID=...
PAYMENT_RAIL_APP_SECRET=...
PAYMENT_RAIL_WEBHOOK_SECRET=...
```

**Never name the payment rail vars `KIPKIREN_PAY_*`** — they don't survive LipaStack transcendence. Per Klokd advisory AD-K06.

**Never set:** `DARAJA_*` / `AT_*` / `WHATSAPP_API_TOKEN` — those live behind KP / Todoku, not in your app. Cardinal rule.

---

## 2. The HMAC signing helper (paste-ready, rail-agnostic)

```typescript
// rails/_shared/sign.ts
import crypto from 'crypto';

export interface SignArgs {
  method: string;
  pathAndQuery: string;
  contentType: string;  // 'application/json; charset=utf-8' for writes, '' for GETs
  timestamp: string;    // RFC 3339, e.g. new Date().toISOString()
  body: string;         // serialized JSON, or '' for GETs
  secret: string;       // app secret as-is; createHmac doesn't care about encoding
}

export function signRequest(args: SignArgs): string {
  const bodyHash = crypto.createHash('sha256').update(args.body, 'utf8').digest('hex');
  const canonical = [
    args.method.toUpperCase(),
    args.pathAndQuery,
    args.contentType,
    args.timestamp,
    bodyHash,
  ].join('\n');
  return crypto.createHmac('sha256', args.secret).update(canonical, 'utf8').digest('base64');
}
```

This one function signs every rail. The only thing that changes is the Authorization header prefix:

| Rail | Authorization header |
|---|---|
| Identiti | `Identiti-HMAC-SHA256 app_id=<id>, signature=<base64>` |
| Todoku | `Todoku-HMAC-SHA256 app_id=<id>, signature=<base64>` |
| Kipkiren Pay | `KipkirenPay-HMAC-SHA256 app_id=<id>, signature=<base64>` |
| Helpan | `Helpan-HMAC-SHA256 app_id=<id>, signature=<base64>` |

And the timestamp header name:
- Identiti: `X-Identiti-Timestamp`
- Todoku: `X-Todoku-Timestamp`
- KP: `X-KipkirenPay-Timestamp` (case-insensitive)

---

## 3. The request wrapper (paste-ready)

```typescript
// rails/_shared/railFetch.ts
import crypto from 'crypto';
import { signRequest } from './sign';

interface RailConfig {
  baseUrl: string;
  appId: string;
  appSecret: string;
  railPrefix: 'Identiti' | 'Todoku' | 'KipkirenPay' | 'Helpan';
  timestampHeader: string; // e.g. 'X-Identiti-Timestamp'
}

interface RailEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; detail?: unknown; field?: string };
  meta?: { request_id?: string; timestamp?: string };
}

export async function railRequest<T>(
  config: RailConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  if (!config.baseUrl || !config.appId || !config.appSecret) {
    throw new Error(`RAIL_CONFIG_INCOMPLETE: ${config.railPrefix.toLowerCase()}`);
  }

  const hasBody = body !== undefined && method !== 'GET';
  const serialized = hasBody ? JSON.stringify(body) : '';
  const contentType = hasBody ? 'application/json; charset=utf-8' : '';
  const timestamp = new Date().toISOString();

  const signature = signRequest({
    method, pathAndQuery: path, contentType, timestamp,
    body: serialized, secret: config.appSecret,
  });

  const headers: Record<string, string> = {
    Authorization: `${config.railPrefix}-HMAC-SHA256 app_id=${config.appId}, signature=${signature}`,
    [config.timestampHeader]: timestamp,
  };
  if (hasBody) {
    headers['Content-Type'] = contentType;
    headers['X-Idempotency-Key'] = crypto.randomUUID();
  }

  const res = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers,
    body: hasBody ? serialized : undefined,
  });

  const text = await res.text();
  let envelope: RailEnvelope<T> | null = null;
  try { envelope = text.length > 0 ? JSON.parse(text) : null; } catch { /* opaque */ }

  if (!res.ok) {
    const code = envelope?.error?.code ?? 'unknown';
    const msg = envelope?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`${config.railPrefix} ${method} ${path} failed: ${code} — ${msg}`);
  }
  if (!envelope || envelope.ok === false || envelope.data === undefined) {
    throw new Error(`${config.railPrefix} ${method} ${path} returned invalid envelope`);
  }
  return envelope.data;
}
```

That's the entire client foundation. Per-rail clients just call `railRequest(...)` with their specific path + body.

---

## 4. Identiti — full spec (LIVE)

### Endpoints

| Verb | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/v1/customers` | Create customer + issue `acc_<uuid>` | HMAC |
| GET | `/v1/customers/{uuid}/tier` | Read current KYC tier | HMAC |
| POST | `/v1/customers/{uuid}/kyc/iprs` | Submit National ID for IPRS verification | HMAC; ⏸ wire schema not yet confirmed against live |
| POST | `/v1/phone-tokens` | Mint 15-min phone token for Todoku resolve | HMAC |
| POST | `/v1/stepup/challenges` | Initiate OTP/WebAuthn challenge | HMAC |
| POST | `/v1/stepup/verify` | Submit OTP, receive RS256 step-up JWT | HMAC |
| GET | `/.well-known/jwks.json` | Public — fetch step-up + Helpan delegated-authority keys | None |

### Create customer — request body

```json
{
  "phone": "+254700000005",
  "name_first": "Wanjiku",
  "name_last": "Mwangi",
  "app_correlation": "<your_app>_<unique_per_user>",
  "consent": {
    "dpa_consent": true,
    "kyc_consent": true,
    "marketing_consent": false,
    "captured_at": "2026-06-10T12:00:00.000Z",
    "captured_via": "app_onboarding"
  }
}
```

**`captured_via` enum** is hard-coded to: `app_onboarding | operator_console | self_service_portal`. Anything else returns 400.

### Create customer — response

```json
{
  "ok": true,
  "data": {
    "account_uuid": "acc_1604cbb1-fd58-490c-9090-5a060eb163fe",
    "state": "pending_onboarding",
    "tier": "tier_0",
    "created_at": "2026-06-10T12:00:00.000Z"
  }
}
```

State: `pending_onboarding | active | suspended`. Tier: `tier_0 | tier_1 | tier_2 | tier_3`.

### Step-up challenge

```json
{
  "account_uuid": "acc_...",
  "operation_audience": "https://api.<your-rail-or-app>.co.ke",
  "operation_kind": "<see enum below>",
  "operation_risk_tier": "low|medium|high",
  "factor": "phone_otp"
}
```

**`operation_kind` is a hard-coded per-app enum on Identiti's side.** As of 2026-06-10 only `kipkiren_pay.*` kinds are pre-registered. To use your own (`yourapp.login`, `yourapp.payout`), Silvia must register them. **For payouts via KP, use `kipkiren_pay.payout.initiate` with `operation_audience: "kipkiren_pay"` — do NOT request a custom `yourapp.payout` kind.** The actor claim carries `actor=<yourapp>` for audit attribution.

### Step-up response (sandbox)

```json
{
  "ok": true,
  "data": {
    "challenge_id": "stp_01J...",
    "factor": "phone_otp",
    "expires_at": "...",
    "delivery_status": "dispatched",
    "otp_plaintext": "517392",
    "sandbox_only": true
  }
}
```

`otp_plaintext` + `sandbox_only` are stripped in production. Useful for dev convenience.

### Step-up verify

```json
// request
{ "challenge_id": "stp_01J...", "response": "517392" }

// response
{
  "ok": true,
  "data": {
    "stepup_token": "<RS256 JWT>",
    "expires_in": 300
  }
}
```

Verify the JWT against `/.well-known/jwks.json`, not against the app secret. JWKS publishes 2 keys: step-up signing + Helpan delegated-authority.

### Phone token

```json
// request
{ "account_uuid": "acc_...", "audience": "todoku" }

// response
{
  "ok": true,
  "data": {
    "phone_token": "<opaque HS256 JWT>",
    "jti": "pht_01J...",
    "audience": "todoku",
    "expires_at": "..."
  }
}
```

**Never cache phone tokens beyond 15-min freshness window.** Request a fresh one per send. Tokens are also single-use per JTI in some cases — safer to mint per call.

### Webhooks (DEFERRED)

Identiti emits to Kafka today (`identiti.kyc.events`, `identiti.account.events`). HTTP webhook signing ships in ID-14 Phase 2. Your handler at `/webhooks/rails/identiti` should be built but inert until the secret lands.

Expected events: `KYC_TIER_CHANGED`, `SIM_SWAP_DETECTED`, `ACCOUNT_DEACTIVATED`.

---

## 5. Todoku — full spec (LIVE)

### Endpoints

| Verb | Path | Purpose |
|---|---|---|
| POST | `/v1/messages/send` | Single send — OTP + transactional + marketing. Class_0 OTP template handles OTP. |
| POST | `/v1/messages/send-bulk` | Batched send |
| GET | `/v1/messages/{id}` | Status read |
| GET | `/v1/messages/{id}/events` | Delivery timeline |
| GET | `/v1/templates` | List approved templates for your tenant |
| GET | `/v1/health` | Unauth health check |

**There is no `/v1/otp/send` endpoint.** Klokd burned cycles assuming there was. OTPs go through `/v1/messages/send` with a `class_0` OTP template.

### Send request

```json
{
  "recipient_token": "<Identiti phone_token JWT>",
  "template_id": "01KTRJ25DNCQ452PWHE2D6VBXY",
  "channel": "sms",
  "template_variables": {
    "otp_code": "123456",
    "expiry_mins": "5"
  }
}
```

**Five field-name traps Klokd discovered the hard way:**
1. `recipient_token` (not `phone_token`, not `recipient`, not `to`)
2. `template_id` is a **26-char Crockford ULID**, not the template slug. Register templates with Todoku, get back ULIDs, store as constants in your code.
3. `template_variables` (not `variables`, not `vars`, not `params`)
4. `channel` is **required** (not derived from template class)
5. **Do NOT send `X-Todoku-Tenant` header.** Klokd's first draft sent it; the rail ignores it but it's misleading. Tenant identity comes from `app_id` inside `Authorization`.

### Send response

```json
{
  "ok": true,
  "data": {
    "message_id": "01KTRPQ4X92VDD25PEY8RJZSW0",
    "channel": "sms",
    "status": "queued",
    "template_id": "01KTRJ25DNCQ452PWHE2D6VBXY",
    "queued_at": "..."
  }
}
```

### Klokd's 8 template ULIDs (your app will get its own)

```typescript
const TODOKU_TEMPLATES = {
  OTP_SMS: '01KTRJ25DNCQ452PWHE2D6VBXY',
  SHIFT_CONFIRMED_SMS: '01KTRJ2CKHA8AW224ZR8MHNEHV',
  SHIFT_CONFIRMED_WA: '01KTRJFAR3Z9WTX1TAWG0ANK52',
  SHIFT_REMINDER_WA: '01KTRJFDYZV04P59RXNE5B3KD7',
  PAYMENT_RECEIVED_SMS: '01KTRJ2JZ41F1NG77H8DBYS2ZY',
  PAYMENT_RECEIVED_WA: '01KTRJFJZQWY44N1AQGS7CVZ7K',
  SHIFT_FILLED_SMS: '01KTRJ2QGCK0HH5R2BP92Q5K57',
  DISPUTE_UPDATE_SMS: '01KTRJ2TV93A9VW7PGDWB4YFZR',
};
```

**Multichannel split**: each event registered as separate `_sms` + `_wa` templates. WhatsApp templates need Meta approval via Todoku (24-72h). For other apps, register templates per `<app>_<event>_<channel>` naming.

### Anti-impersonation copy (mandatory per Reboot Pack §A.3)

Every template MUST embed standard anti-impersonation copy or Todoku auto-rejects on approval:
- OTP: "Do not share this code with anyone. <App> staff will never call you to ask for it."
- Payment confirmations: "<App> staff will never call you to reverse this transaction or ask for your M-PESA PIN."
- Shift/order confirmations: "<App> staff will never ask you to pay a deposit."
- Dispute updates: "<App> staff will never call you to settle a dispute outside the app."

### Webhooks

Active. Outbound deliveries POST to your registered URL with HMAC signature (`X-Todoku-Signature` or similar — confirm with rail Claude). Retry ladder: 30s → 5min → 30min → 6h → 24h, abandoned after 5 attempts.

Events: `MESSAGE_DELIVERED`, `MESSAGE_FAILED`, `MESSAGE_SENT`.

Webhook canonical string (different from request signing):
```
{TIMESTAMP}.{NONCE}.{raw_body}
```
Dot-delimited. Base64 HMAC.

### Cross-rail sandbox gap (escalation pending)

Todoku's sandbox only accepts `recipient_token` values starting with `SANDBOX_TOKEN_DELIVER_OK_*`. Real Identiti sandbox JWTs are rejected with `CHAN_PHONE_TOKEN_INVALID`. Production should work since Todoku-prod hits real Identiti. For local sandbox testing of the full chain (your app → Identiti → Todoku), synthesize the sandbox token:

```typescript
const sandboxToken = `SANDBOX_TOKEN_DELIVER_OK_${appSlug}_${userId}`;
```

Documented as an escalation in Klokd's `SILVIA_ESCALATIONS.md`. Either Identiti issues sandbox-prefixed tokens or Todoku accepts real Identiti JWTs.

---

## 6. Payment Rail (Kipkiren Pay → LipaStack) — full spec (PENDING DEPLOY)

KP rail-side handover received 2026-06-10 (in `RECAP.md` from the KP Claude session). Highlights below; full handover is verbatim in section 12 of this file.

### Vocabulary deltas you must encode in your client

| Your concept | KP wire term |
|---|---|
| Escrow | **Hold** (`/v1/holds`, `hold_id`) |
| Escrow ref | `hold_id` |
| Escrow fund | `POST /v1/holds` |
| Escrow release | `POST /v1/holds/:hold_id/release` |
| Escrow reverse | `POST /v1/holds/:hold_id/refund` (NOT `reverse`) |
| Wallet create | `POST /v1/accounts` (combines account + wallet) |
| Wallet balance | `GET /v1/accounts/:account_uuid/wallet` |
| Wallet limits | **Does not exist as endpoint** — tier limits enforced server-side, not readable. Request a `GET /v1/accounts/:uuid/limits` from KP if you need pre-check. |
| Payout initiate | `POST /v1/payouts/initiate` (note `/initiate` suffix) |
| Payout status | `GET /v1/payouts/:id` |
| Statement export | `POST /v1/accounts/:uuid/statements/export` |

### Units — KES MINOR units everywhere

```typescript
// Boundary helpers (your client must include these)
export const toKpMinor = (kes: number): bigint => BigInt(Math.round(kes * 100));
export const fromKpMinor = (minor: string | bigint): number => Number(BigInt(minor)) / 100;
```

Request bodies: `amount_minor: 185000` (= KES 1850).
Response bodies: `amount_minor: "185000"` (string, to dodge JSON bigint precision).
Step-up thresholds: also in minor units (KES 10,000 == `1_000_000` minor).

### Step-up

- Threshold: **KES 10,000** single payout (not KES 5,000 as Klokd originally proposed)
- No 24h cumulative rule on KP — that's an app-side wrapper if you want it
- Audience: `kipkiren_pay` (NOT a custom `<yourapp>.payout` audience)
- Operation kind: `kipkiren_pay.payout.initiate` (pre-registered in Identiti)
- Actor claim: `actor=<yourapp>` for audit attribution

### Webhooks — DESIGN CALL NEEDED

KP today emits to Kafka only (`kp.wallet.events`, `kp.payout.events`). Hold events not yet emitted. Three forks:

1. **Consume Kafka directly** — run a `kafkajs` consumer on `kp.wallet.events` / `kp.payout.events` / `kp.hold.events`. No `PAYMENT_RAIL_WEBHOOK_SECRET` needed. Lower latency.
2. **KP builds HTTP webhook signer** — ~1 sprint of KP work to translate Kafka → signed HTTP POST. The architecture Klokd originally assumed.
3. **Poll the GET endpoints** — higher latency; acceptable for escrow/payout status; not great for `WALLET_CREDITED` (consumer waiting on STK callback).

**Klokd recommendation:** (1) for sandbox, (2) for production if your app isn't Kafka-shaped.

### Webhook payload shapes (when fork (2) lands)

```json
// kp.wallet.events / WALLET_CREDITED
{
  "topic": "kp.wallet.events",
  "type": "WALLET_CREDITED",
  "key": "01HZW0…",
  "occurred_at": "2026-06-10T12:00:00.000Z",
  "data": {
    "account_uuid": "01HZW0…",
    "wallet_id": "01J0…",
    "amount_minor": "185000",
    "new_spendable_minor": "1850000",
    "reference_type": "topup",
    "reference_id": "01J0STK…",
    "mpesa_receipt": "NLJ7RT61SV"
  }
}

// kp.payout.events / PAYOUT_COMPLETED
{
  "topic": "kp.payout.events",
  "type": "PAYOUT_COMPLETED",
  "data": {
    "payout_id": "01J0…",
    "account_uuid": "01HZW0…",
    "amount_minor": "185000",
    "outcome": "completed",
    "mpesa_conversation_id": "AG_2026…",
    "refunded": false
  }
}

// kp.payout.events / PAYOUT_FAILED
{
  "topic": "kp.payout.events",
  "type": "PAYOUT_FAILED",
  "data": {
    "payout_id": "01J0…",
    "amount_minor": "185000",
    "outcome": "failed",
    "result_code": 2001,
    "failure_reason": "Wrong PIN",
    "refunded": true
  }
}

// kp.hold.events / HOLD_RESERVED  (will emit once KP adds — ~30 min work)
// This is your "ESCROW_FUNDED" signal.
{
  "topic": "kp.hold.events",
  "type": "HOLD_RESERVED",
  "data": {
    "hold_id": "01J0…",
    "payer_account_uuid": "01HZW0…",
    "payee_account_uuid": "01HZW0…",
    "amount_minor": "185000",
    "purpose": "<app>_<reason>"
  }
}
```

**Field name nuances:**
- Top-ups: `mpesa_receipt` (Safaricom receipt ID)
- Payouts: `mpesa_conversation_id` (Daraja B2C conversation ID)
- Don't conflate the two

### Sandbox MSISDNs

- Identiti issues `+254700000005` / `+254700000006` for identity flows; **NOT Daraja-registered**, will fail at STK push
- KP recommends `254708374149` (Safaricom universal sandbox test number) for STK testing
- Current Daraja sandbox state: that number returns `ResultCode 1037` ("DS timeout") rather than success. Use KP's `scripts/full-demo.ts` to synthesize success callbacks during dev.

### Scopes

KP currently has no granular scope model. Two named scopes only: `operator`, `kipkiren.payments.verify`. Otherwise tenant-class gates access (`external_billed` vs `internal_bypass` vs `portfolio`). Granular per-resource scopes are roadmap.

---

## 7. Hakken (placeholder)

Sprint 5 scope per Klokd advisory §2.4. Not yet wired. Env var slots reserved:

```env
HAKKEN_API_BASE=
HAKKEN_APP_ID=
HAKKEN_APP_SECRET=
```

When you get there, follow the same HMAC pattern. Endpoints (per advisory):

```
POST   /v1/hakken/entities/shifts        — register shift entity
PATCH  /v1/hakken/entities/shifts/:id    — update status
POST   /v1/hakken/entities/workers       — register worker entity
PATCH  /v1/hakken/entities/workers/:id   — update availability/rating
GET    /v1/hakken/discovery/shifts       — Phase 3: worker-side feed
GET    /v1/hakken/discovery/workers      — Phase 3: employer-side ranking
```

Cross-reference shift status against your own ShiftEventLog — Hakken is never source of truth for shift state.

---

## 8. Cardinal rule — what your app must NOT do

These are non-negotiable. Violations break the cross-portfolio architecture.

| Cardinal rule | Means in code |
|---|---|
| Apps never hold customer funds | No `DARAJA_*` env vars. No `consumer_key` / `consumer_secret`. No `/callback/stk` or `/callback/b2c` routes. KP signs Daraja internally. |
| Apps never store KYC documents | No S3 bucket for National ID images. No `id_front_key` / `id_back_key` / `selfie_key` columns. Identiti's IPRS endpoint is data-lookup-based; you collect typed `national_id + DOB`, not photos. |
| Apps never run their own SMS infra | No `AT_API_KEY`. No `WHATSAPP_API_TOKEN`. No direct Africa's Talking or Meta WhatsApp Business API client. Todoku owns all SMS/WhatsApp/voice. |
| Apps never hold raw phone numbers in queues/logs | The `phone` column on your User table is for E.164 lookup only; never log it; never include in audit_log payloads; never put in SQS message bodies. Use `account_uuid` everywhere downstream. |
| Apps never hold M-Pesa numbers | The M-Pesa destination for payouts is held by KP wallet, derived from Identiti phone token. Your app doesn't have an `mpesa_number` column. |

### What you DO legitimately own

- Your domain event log (e.g. `shift_events`, `order_events`) — your business state machine
- Compliance engine (PAYE, NSSF, SHIF, AHL deductions — Kenya-tax-specific; calculate, pass net amount to KP, KP deducts at settlement)
- Contract / receipt generation (Employment Act / Consumer Protection Act)
- App-internal S3 for **pay statements + contracts** (NOT identity documents)
- Direct FCM/Expo Push for in-app notifications (NOT SMS/WhatsApp — those go via Todoku)
- Webhook subscription service for third-party integrations (your customers' Slack/Zapier, not the rails)

---

## 9. Webhook router (paste-ready)

```typescript
// rails/webhook.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import crypto from 'crypto';

function verifyHmac(getSecret: () => string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const secret = getSecret();
    if (!secret) return next(new Error('Webhook secret not configured'));

    const signature = req.header('X-Webhook-Signature') || '';
    const raw = (req.body as Buffer) ?? Buffer.alloc(0);
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    const ok =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

    if (!ok) return next(new Error('Invalid webhook signature'));

    (req as any).parsedBody = JSON.parse(raw.toString('utf8'));
    next();
  };
}

const router = Router();
router.use(express.raw({ type: '*/*', limit: '1mb' }));

router.post('/identiti', verifyHmac(() => process.env.IDENTITI_WEBHOOK_SECRET!),
  async (req, res, next) => { /* handle KYC_TIER_CHANGED etc */ });
router.post('/todoku', verifyHmac(() => process.env.TODOKU_WEBHOOK_SECRET!),
  async (req, res, next) => { /* handle MESSAGE_DELIVERED etc */ });
router.post('/payment-rail', verifyHmac(() => process.env.PAYMENT_RAIL_WEBHOOK_SECRET!),
  async (req, res, next) => { /* handle PAYOUT_COMPLETED etc */ });

export default router;
```

**Critical:** mount this router BEFORE `app.use(express.json())` in your `app.ts` — the raw body parser is needed for HMAC verification. Otherwise the JSON parser eats the body and signature verification fails.

---

## 10. Pre-flight checklist — paste into your operator request

When you draft `OPERATOR_REQUEST_<RAIL>.md` for a new app, your operator (Silvia or rail Claude) needs to provide:

```markdown
## Mandatory deliverables

1. <RAIL>_API_BASE — actual deployed URL (not Railway dashboard placeholder).
   Confirm with: curl <base>/v1/health → 200
2. <RAIL>_APP_ID — opaque string (typically `<yourapp>_sandbox`)
3. <RAIL>_APP_SECRET — encoding per rail:
   - Identiti: hex-64
   - Todoku: base64url-43 (no padding)
   - Kipkiren Pay: base64url-43 (per KP confirmation)
   - Hakken: TBD
4. <RAIL>_WEBHOOK_SECRET — same encoding as APP_SECRET; or null if rail uses Kafka
5. Wire format deltas vs the standard pattern (§2 of KMV_RAILS_INTEGRATION_GUIDE.md):
   - Authorization header prefix
   - Timestamp header name
   - Endpoint path corrections from the assumed `/v1/<resource>` shape
   - Field naming surprises in request bodies (e.g. `template_variables` not `variables`)
   - Response envelope deviations from `{ok, data, meta}`
6. Webhook event names + payload examples (paste-ready JSON)
7. Step-up policy thresholds (if applicable)
8. Sandbox test MSISDNs / identifiers
9. Operator console access for self-service config (template approval, webhook URL registration)
```

The operator pack template at `c:/Projects/Klokd/OPERATOR_REQUEST_*.md` shows the full shape; the above is the minimum.

### Lessons learned about what NOT to ask

- Don't ask the rail to follow your env-var naming. Use your own naming on the consumer side; map at the boundary.
- Don't argue about wire format. The live rail is authoritative; the operator pack docs lag.
- Don't expect the rail to know your app's flow. They give you APIs; you compose them.

---

## 11. Smoke test pattern (paste-ready)

This is the script that verified each rail before writing client code. Run it after you get credentials, BEFORE writing your client. If it 401s, your client will too — debug at the protocol level first.

```typescript
// scripts/smoke-<rail>.ts
// Run: <RAIL>_API_BASE=... <RAIL>_APP_ID=... <RAIL>_APP_SECRET=... npx tsx scripts/smoke-<rail>.ts

import crypto from 'crypto';

const base = process.env.IDENTITI_API_BASE!;
const appId = process.env.IDENTITI_APP_ID!;
const secret = process.env.IDENTITI_APP_SECRET!;

async function call(method: string, path: string, body?: unknown) {
  const serialized = body ? JSON.stringify(body) : '';
  const ct = body ? 'application/json; charset=utf-8' : '';
  const ts = new Date().toISOString();
  const bodyHash = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
  const canonical = [method, path, ct, ts, bodyHash].join('\n');
  const sig = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('base64');

  const headers: Record<string, string> = {
    Authorization: `Identiti-HMAC-SHA256 app_id=${appId}, signature=${sig}`,
    'X-Identiti-Timestamp': ts,
  };
  if (body) {
    headers['Content-Type'] = ct;
    headers['X-Idempotency-Key'] = crypto.randomUUID();
  }

  const res = await fetch(base + path, { method, headers, body: body ? serialized : undefined });
  console.log(`${method} ${path} => ${res.status}`);
  console.log(await res.text());
  console.log();
}

(async () => {
  // 1. Health check (no auth required for /.well-known/jwks.json)
  const jwks = await fetch(base + '/.well-known/jwks.json');
  console.log('JWKS:', jwks.status, '✓');

  // 2. Create a customer
  await call('POST', '/v1/customers', {
    phone: '+254700000099',
    name_first: 'Smoke',
    name_last: 'Test',
    app_correlation: `smoke_${Date.now()}`,
    consent: {
      dpa_consent: true,
      kyc_consent: true,
      marketing_consent: false,
      captured_at: new Date().toISOString(),
      captured_via: 'app_onboarding',
    },
  });
})();
```

**If you get a 401 `AUTH_HMAC_INVALID` on first try, check in this order:**
1. Is signature output **base64** (not hex)?
2. Is the path in the signing string the same as the request path (including `/v1/` prefix)?
3. Is `contentType` empty string `""` for GETs (not undefined, not `application/json`)?
4. Is the Content-Type header transmitted byte-identical to what you signed?
5. Is the timestamp within 5 min of server clock?

If 400 instead, you got past auth — schema mismatch. Read the `error.detail.errors[].params.missingProperty` field to see what's required.

---

## 12. Escalation log — what broke and how it was caught

This is the running list of issues discovered during Klokd's integration. Track yours similarly in your app's `<APP>_ESCALATIONS.md`.

### Identiti

| Issue | Discovery | Status |
|---|---|---|
| Operator pack says signature is hex; live rail expects base64 | First smoke test 401'd; verified via `platform-shared/dist/hmac.js` | Documented; awaiting operator pack fix |
| LD reference client signs `/customers` (no `/v1/`); live rail serves `/v1/customers` | Smoke test 404'd | Documented in this guide |
| Customer create body needs `name_first + name_last + app_correlation + consent`; operator pack only showed `phone` | Smoke test 400'd with schema validation errors | Documented in this guide |
| `consent.captured_via` enum hard-coded to 3 values | 400 validation error | Documented |
| `operation_kind` enum is per-app; only `kipkiren_pay.*` pre-registered for Klokd | Step-up call 400'd | Escalated to Silvia; for KP-bound step-ups use `kipkiren_pay.payout.initiate` |
| Webhook HTTP signing deferred to ID-14 Phase 2 (Kafka-only today) | Read operator pack §2 carefully | Build handler now; activate when secret lands |

### Todoku

| Issue | Discovery | Status |
|---|---|---|
| `/v1/otp/send` endpoint doesn't exist; all sends via `/v1/messages/send` | First smoke 404'd | Documented |
| `template_id` is 26-char ULID, not slug | Smoke 400'd | Documented; templates pre-registered for Klokd, ULIDs listed §5 |
| `template_variables` field name (not `variables`) | Smoke 400'd with `additionalProperty: variables` error | Documented |
| `X-Todoku-Tenant` header ignored — tenant from `app_id` in Authorization | Klokd's first client sent it; harmless but misleading | Documented |
| Sandbox only accepts `SANDBOX_TOKEN_DELIVER_OK_*` prefixed tokens; real Identiti JWTs rejected with `CHAN_PHONE_TOKEN_INVALID` | Smoke through Identiti→Todoku failed | Escalated to Silvia (cross-rail coordination gap); production unaffected |
| Secret encoding is base64url-43 (no padding), NOT base64-44 like Identiti's hex-64 | Read operator pack §2 carefully | Documented |

### Payment Rail (Kipkiren Pay)

| Issue | Discovery | Status |
|---|---|---|
| Vocabulary: "holds" not "escrow"; "refund" not "reverse" | KP handover 2026-06-10 | Documented; update your client to use KP terms internally |
| `POST /v1/wallets` doesn't exist; combined into `POST /v1/accounts` | KP handover | Documented |
| `GET /v1/wallets/:uuid/limits` doesn't exist; tier limits server-only | KP handover | Either pre-check via app-side hardcoded limits or request KP to add endpoint |
| All amounts in KES MINOR units (×100); float arithmetic banned | KP handover | Boundary helpers in §6 |
| Step-up threshold KES 10K not KES 5K | KP handover | Documented |
| `operation_kind: "yourapp.payout"` would fail; use `kipkiren_pay.payout.initiate` with `audience: kipkiren_pay` | KP handover | Documented; saves an Identiti enum registration round-trip |
| No HTTP webhook signer today; Kafka-only emission. `PAYMENT_RAIL_WEBHOOK_SECRET` doesn't exist yet | KP handover | Design fork decision required: consume Kafka direct, wait for KP webhook signer, or poll |
| Hold events not emitted (only wallet + payout events) | KP handover | KP adding `kp.hold.events` topic (~30 min work) — your `ESCROW_FUNDED` maps to `HOLD_RESERVED` |
| `mpesa_ref` field name differs by resource: `mpesa_receipt` (top-ups) vs `mpesa_conversation_id` (payouts) | KP handover | Documented |

---

## 13. Klokd reference implementation — copy what works

The Klokd repo (`iamkn1ght/klokd`) at commit `2d0222c` has:

```
octopus-api/src/modules/rails/
├── identiti.client.ts        ← HMAC-SHA256 base64, /v1/* paths, envelope unwrap
├── identiti.dto.ts           ← Wire types matching live contract
├── todoku.client.ts          ← Same pattern, Todoku prefix + template ULIDs
├── todoku.dto.ts
├── templates.ts              ← 8 ULID constants
├── payment-rail.client.ts    ← (to be rewritten per KP handover §12 of this guide)
├── payment-rail.dto.ts
├── webhook.routes.ts         ← HMAC-verified ingress for all 3 rails
└── index.ts                  ← Barrel exports

octopus-api/scripts/
├── smoke-identiti.ts         ← Live smoke test
└── smoke-todoku.ts           ← Live smoke test (use sandbox token shim)

octopus-api/public/demo.html  ← Visual rail flow demo page
octopus-api/src/modules/demo/demo.routes.ts ← Backing endpoints

octopus-api/.env.example      ← Canonical env var shape

octopus-api/prisma/migrations/20260609120000_rails_v3/migration.sql
├── account_uuid + kyc_tier + wallet_id on User/Worker/Employer
├── payment_rail_ref + mpesa_ref on Payment
└── notification_log table (NO phone_number column — cardinal rule)
```

Copy the rails module wholesale into your new app; rename `Klokd` → your app, adjust DTOs for your domain. The signing logic is identical.

---

## 14. The full KP handover (2026-06-10) — reference

The complete KP → Klokd handover is in Klokd's git history. Key items extracted in §6 above. For new apps, the decisions Klokd had to make:

- **Webhook fork:** Klokd chose (1) Kafka-direct for production (lower latency, matches the rest of the portfolio); (3) polling acceptable for sandbox while KP holds emit nothing
- **Wallet topology:** Klokd designed `PaymentRailClient` for option (a) — LipaStack absorbs at Phase 3
- **Step-up:** follow KP's KES 10K threshold; use `kipkiren_pay.payout.initiate` audience/kind
- **Limits endpoint:** Klokd requested `GET /v1/accounts/:uuid/limits` (KP committed ~30 min add)
- **Holds endpoint:** Klokd requested `GET /v1/holds/:hold_id` for polling fallback (KP committed ~15 min add)

If your app makes different choices, document them in your app's escalation log.

---

## 15. Quick-start checklist for a brand new app

1. Decide which rails you need (most apps: Identiti + Todoku + KP)
2. Spin up `OPERATOR_REQUEST_<RAIL>.md` per rail, paste the §10 checklist
3. Wait for credentials. Validate each URL with health check
4. Add env var slots to `.env.example` per §1 naming convention
5. Copy the signing helper + railRequest wrapper from §2 + §3 into `rails/_shared/`
6. Build per-rail client classes (mirror `octopus-api/src/modules/rails/*.client.ts`)
7. Write smoke test per rail per §11. **Do not write business logic until smoke passes.**
8. Build webhook router per §9 (mount before `express.json()`)
9. Build app DTOs matching the wire (§4 Identiti, §5 Todoku, §6 KP)
10. Add `account_uuid` as primary FK on every user-shaped table
11. Audit your codebase for cardinal-rule violations (§8) — remove any direct Daraja/AT/WhatsApp code
12. Stand up a demo page (copy Klokd's `public/demo.html`) for visual validation

---

*Version 1.0 · 2026-06-10*
*Maintainer: Klokd integration team; next maintainer = next app's integration team*
*Update this guide whenever you discover a new rail behavior the doc doesn't predict.*
