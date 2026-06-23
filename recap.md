# Project Recap — Unique Accessories

A Next.js 15 e-commerce storefront for "Unique Accessories", backed by **Sanity** (CMS + data store) and **PayPal** (payments). This recap summarizes the full state of the codebase as of the read-through.

## Stack

- **Next.js 15.1.0** (App Router) + **React 18** + **TypeScript**
- **Sanity** (`next-sanity`) — product catalog, hero images, and order storage (no separate database)
- **PayPal Orders API v2** — server-side create + capture, plus a signature-verified webhook
- **use-shopping-cart** — client-side cart state (persisted, `client-only` mode)
- **Tailwind CSS 3** + **shadcn/ui** (Radix primitives, `lucide-react` icons)

## Directory layout

```
app/
  layout.tsx              Root layout: fonts, SEO metadata, Providers, Navbar, cart modal
  page.tsx                Home page (Newest + Hero)
  interface.ts            Shared types: simplifiedProduct, fullProduct
  error.tsx               Global error boundary
  not-found.tsx           404 page
  robots.ts / sitemap.ts  SEO route handlers
  globals.css

  all/page.tsx            "All products" listing
  [category]/page.tsx     Per-category product listing (dynamic)
  product/[slug]/page.tsx Product detail page (+ JSON-LD, OG metadata)
  success/page.tsx        Post-checkout confirmation
  cancel/page.tsx         Checkout-cancelled page

  components/
    Navbar.tsx            Top nav + cart button
    Hero.tsx              Hero section w/ Sanity hero images + category links
    Newest.tsx            4 most recent products on the home page
    AddToBag.tsx          "Add To Cart" button (client)
    CheckoutNow.tsx       PayPal buttons (create/capture flow, client)
    ShoppingCartModal.tsx Slide-out cart (shadcn Sheet)
    Providers.tsx         PayPalScriptProvider + CartProvider wrapper
    imageGallery.tsx      Product image gallery w/ thumbnail switching

  lib/
    sanity.ts             Read client + urlFor() image builder
    sanity-write.ts       Server-only write client (needs SANITY_API_TOKEN)
    paypal.ts             Server-only: auth, createOrder, captureOrder, verifyWebhookSignature

  api/paypal/
    create-order/route.ts  POST → validates cart, creates PayPal order
    capture-order/route.ts POST → captures payment, persists order to Sanity
    webhook/route.ts       POST → verifies signature, patches order status

sanity/
  sanity.config.ts        Studio config
  schemaTypes/            product, category, heroimages (heroImage), order
```

## Data model (Sanity)

- **product** — name, images[], description, slug, price, category (reference)
- **category** — name
- **heroImage** — image1, image2 (two homepage hero images)
- **order** — read-only; written after capture. Holds PayPal order id, status, currency, total, items[], payer email/name, shipping address, capturedAt, and the raw capture JSON (for audit). `_id` is `order.${paypalOrderId}` for idempotency.

Sanity project defaults (from `app/lib/sanity.ts`): projectId `d0fzn4cs`, dataset `sanityyy`, API version `2022-03-25`, `useCdn: true` for reads.

## Checkout flow

1. Customer adds items to cart (`use-shopping-cart`, persisted client-side).
2. `<PayPalButtons>` → `POST /api/paypal/create-order` builds an Orders API v2 order from the cart (server validates each item: name/quantity/price types and ranges).
3. Customer approves in the PayPal popup.
4. `<PayPalButtons>` → `POST /api/paypal/capture-order` captures payment and writes the order to Sanity via `createOrReplace` (idempotent). Persist failures are logged but don't fail the response.
5. Client clears the cart and redirects to `/success`.
6. Async events (refunds, disputes, denials) hit `POST /api/paypal/webhook`, are verified against `PAYPAL_WEBHOOK_ID`, and patch the order's `status`.

Webhook event → status mapping: `PAYMENT.CAPTURE.COMPLETED` → COMPLETED, `PAYMENT.CAPTURE.REFUNDED` → REFUNDED, `PAYMENT.CAPTURE.DENIED` → FAILED, `CUSTOMER.DISPUTE.CREATED/UPDATED` → DISPUTED.

## Configuration

Environment variables (see `.env.example` / README for full table):

- `NEXT_PUBLIC_BASE_URL` — origin for checkout redirects
- `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `NEXT_PUBLIC_SANITY_API_VERSION`
- `SANITY_API_TOKEN` — write token, required to persist orders
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_API_BASE` (sandbox vs live), `PAYPAL_WEBHOOK_ID`

`next.config.ts` whitelists `cdn.sanity.io` for `next/image`. PayPal defaults to the **sandbox** API base.

## SEO

- Root layout sets title template, OpenGraph, and Twitter card metadata.
- Product pages emit `Product` JSON-LD and per-product OG images.
- `robots.ts` disallows `/api/`, `/success`, `/cancel`; `sitemap.ts` enumerates static routes, categories, and all product slugs.

## Notable observations

- **Navbar categories are hardcoded** (`Electronics`, `Kitchenware`, `Furniture`, `Accessories`) and case-sensitive; they must match Sanity `category.name` values for `[category]` pages to return products.
- **Stripe is fully removed** — `use-shopping-cart` runs in `client-only` mode with `stripe=""`; PayPal is the sole provider.
- Order persistence is best-effort on capture; the PayPal webhook is the durable path for status changes.
- Product detail page shows a **hardcoded** rating (4.2 / 43 ratings) and a fake "was" price (`price + 30`) with a "Sale" badge — placeholder UI, not real data.

## Scripts

```bash
npm run dev     # next dev
npm run build   # next build
npm run start   # next start
npm run lint    # next lint
```

## Status

Core storefront and the full PayPal checkout pipeline (create → capture → persist → webhook) are implemented, along with SEO, error/404/cancel/success pages, and the Sanity schema. Remaining work is largely content population, switching PayPal to live credentials, and replacing placeholder product UI (ratings/sale price) with real data.
