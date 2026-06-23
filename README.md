# Unique Accessories

Next.js 15 e-commerce storefront backed by Sanity CMS and PayPal.

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Sanity** — product catalog + order storage (no separate database)
- **PayPal Orders API v2** — server-side create + capture, signed webhook
- **use-shopping-cart** — client cart state
- **Tailwind CSS** + shadcn/ui

## Setup

```bash
npm install
cp .env.example .env
# fill in the values described below
npm run dev
```

### Environment variables

| Variable | Where to get it | Required |
|---|---|---|
| `NEXT_PUBLIC_BASE_URL` | Your deployed origin (e.g. `https://shop.example.com`). Use `http://localhost:3000` locally. | yes |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | [sanity.io/manage](https://www.sanity.io/manage) → your project | yes |
| `NEXT_PUBLIC_SANITY_DATASET` | usually `production` | yes |
| `NEXT_PUBLIC_SANITY_API_VERSION` | e.g. `2022-03-25` | yes |
| `SANITY_API_TOKEN` | Sanity → API → Tokens (Editor role). Required to persist orders. | yes |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | [developer.paypal.com](https://developer.paypal.com/dashboard/applications) | yes |
| `PAYPAL_CLIENT_SECRET` | same dashboard | yes |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` or `https://api-m.paypal.com` | yes |
| `PAYPAL_WEBHOOK_ID` | PayPal app → Webhooks tab. Point it at `{NEXT_PUBLIC_BASE_URL}/api/paypal/webhook`. | for webhook verification |

## Scripts

```bash
npm run dev     # next dev
npm run build   # next build
npm run start   # next start
npm run lint    # next lint
```

## Content model (Sanity)

- **product** — name, slug, images, price, description, category (reference)
- **category** — name
- **heroimages** — two hero images for the homepage
- **order** — read-only; created by `/api/paypal/capture-order` after capture. Contains PayPal order id, items, total, payer info, shipping address, status, and raw capture JSON.

## Checkout flow

1. Customer adds items to the cart (`use-shopping-cart`).
2. `<PayPalButtons>` calls `POST /api/paypal/create-order` → creates an Orders API v2 order with cart items.
3. Customer approves in the PayPal popup.
4. `<PayPalButtons>` calls `POST /api/paypal/capture-order` → captures the payment and writes the order to Sanity (`_id` = `order.${paypalOrderId}` for idempotency).
5. Client clears cart + redirects to `/success`.
6. Async PayPal events (refunds, disputes) hit `POST /api/paypal/webhook`, are verified against `PAYPAL_WEBHOOK_ID`, and patch the order's status.

Orders are viewable in Sanity Studio.

## Deploy

Vercel:

1. Push to GitHub.
2. Import in Vercel, add every variable from `.env.example`.
3. Set `NEXT_PUBLIC_BASE_URL` to the deployed origin.
4. Flip `PAYPAL_API_BASE` to `https://api-m.paypal.com` and swap to live PayPal credentials when ready.
5. Register the webhook in the PayPal dashboard pointing at `https://<your-domain>/api/paypal/webhook` and subscribe to `PAYMENT.CAPTURE.*` and `CUSTOMER.DISPUTE.*` events.
