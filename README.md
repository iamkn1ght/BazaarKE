# BazaarKE

A Next.js 15 e-commerce storefront for Kenya, integrated with the **KMV platform rails**: M-Pesa payments via **Kipkiren Pay**, accounts/KYC via **Identiti**, SMS/WhatsApp via **Todoku**, and last-mile delivery via **Itafika**. KES-denominated, editorial design, Sanity-backed.

> **Brand vs. identity:** the consumer brand is **BazaarKE**. The operator-provisioned rail identity (app slug `unique_accessories`, tenant/anchor names, and the legal entity "Unique Accessories Ltd") is unchanged in the rail clients and `OPERATOR_REQUEST_*.md` files until re-provisioned with the operator.

## Stack

- **Next.js 15** (App Router) + TypeScript + React 18
- **Sanity** — product catalog + order store (no separate database)
- **Tailwind CSS 3** + shadcn/ui, **Geist** type, light/dark theme (`next-themes`)
- **use-shopping-cart** — client cart (KES minor units)
- **KMV rails** (HMAC-signed clients under `app/lib/rails/`): Identiti, Kipkiren Pay, Todoku, Itafika

> **Cardinal Rule:** this app never calls third-party payment/comms/identity providers directly (no PayPal, Daraja, Africa's Talking, Twilio, WhatsApp direct). Everything goes through a KMV rail. Money is **integer KES minor units** only (KES 50 = 5000).

## Setup

```bash
npm install
cp .env.example .env   # fill in the values below
npm run dev            # http://localhost:3000
```

### Environment variables

Rail credentials are provisioned by the platform operator (see `OPERATOR_REQUEST_*.md`). Per-rail **secret encoding** matters: Identiti + Itafika are **hex-64**, Kipkiren Pay + Todoku are **base64url-43**.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | Deployed origin (e.g. `https://shop.example.com`); `http://localhost:3000` locally |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` / `_DATASET` / `_API_VERSION` | Sanity project; canonical dataset is `sanityyy` |
| `SANITY_API_TOKEN` | Editor token; required to persist orders |
| `IDENTITI_API_BASE` / `_APP_ID` / `_APP_SECRET` | Identiti (hex-64 secret) |
| `PAYMENT_RAIL_API_BASE` / `_APP_ID` / `_APP_SECRET` / `_AUDIENCE` | Kipkiren Pay (base64url-43). `PAYMENT_RAIL_*`, never `KIPKIREN_*` (AD-K06) |
| `TODOKU_API_BASE` / `_APP_ID` / `_APP_SECRET` / `_WEBHOOK_SECRET` + `TODOKU_TPL_*` | Todoku (base64url-43) + 8 template ULIDs |
| `ITAFIKA_BASE_URL` / `_APP_ID` / `_APP_SECRET` | Itafika (hex-64; same secret signs both directions) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV for webhook dedup (required in production) |

## Scripts

```bash
npm run dev               # next dev
npm run build             # next build
npm run lint              # next lint
npm run test              # node:test unit suite (signer, money, templates, Itafika)
npm run smoke:identiti    # per-rail smoke tests (require live creds)
npm run smoke:payment-rail
npm run smoke:todoku
npm run smoke:itafika
npm run migrate:sanity    # re-price catalog to KES minor units + tag legacy orders (--apply to write)
```

## Content model (Sanity)

- **product** — name, slug, images, `price_minor` (KES minor units, required), description, category. Legacy `price` retained as non-authoritative.
- **category** — name
- **heroImage** — two homepage hero images
- **order** — read-only; rail-aligned (`account_uuid`, `state`, `total_minor`, `kp_charge_id`, `itafika_job_id`, `delivery_fee_minor`, `shipping_destination`, `traceparent`, `business_op_id`, `rail_audit[]`) with PayPal-era fields kept in a legacy group.

## Checkout flow (Kipkiren Pay)

1. Customer adds items (cart in KES minor units).
2. `POST /api/checkout/initiate` resolves the buyer's Identiti `account_uuid` (anonymous-express creates a tier-0 account on the fly), recomputes the total **server-authoritatively** from Sanity, creates the order, and calls KP `charges/initiate` (idempotent on a stable `checkout_attempt_id`).
3. KP sends an **M-Pesa STK push**; the cart UI shows a countdown ring and polls `GET /api/checkout/status`.
4. The KP **Kafka consumer** (or the inert HTTP webhook) marks the order `PAID` (forward-only state guard, KV dedup), triggers Todoku order-confirmation and Itafika dispatch, and the customer is redirected to `/success`.

## Project structure

```
app/lib/rails/
  _shared/    signRequest (base64 sig / hex body-hash / v1-prefix), railFetch, dedup (KV), trace
  identiti/   customers, customer-token, phone-tokens, stepup, tier; inert webhook
  payment-rail/  money.ts, client, handlers, kafka-consumer, inert HTTP webhook
  todoku/     client, 8 templates, notifyAccount
  itafika/    asymmetric signer (base64 out / hex in), client, main-loop webhook, dispatch
app/api/webhooks/  identiti · payment-rail · itafika
app/api/checkout/  initiate · status
```

## Docs

- `docs/RAIL_INTEGRATION_PLAYBOOK.md` — the integration map
- `docs/KMV_RAILS_INTEGRATION_GUIDE.md` — byte-exact wire formats
- `docs/DEPLOYMENT_READINESS.md` — go-live checklist + operator blockers
- `RECAP.md` — sprint state, cross-rail status, blockers
- `OPERATOR_REQUEST_{CHAMIA,IDENTITI,KP,TODOKU,ITAFIKA,HAKKEN,HELPAN}.md` — operator provisioning asks

## Status

**Phase 1 is code-complete and operator-gated** — all four rails are wired, type-checked, tested, and build green, but go-live is gated on operator credentials and the Kipkiren Pay deployment. Every rail path degrades gracefully (503 / inert-log) when credentials are absent. See `RECAP.md` and `docs/DEPLOYMENT_READINESS.md`.
