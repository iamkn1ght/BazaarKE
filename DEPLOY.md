# Deploying BazaarKE to Vercel (public preview)

GitHub Pages **cannot** host this app — it's static-only, and BazaarKE is a server-rendered
Next.js app that needs a Node runtime for its API routes (`/api/checkout/*`, `/api/webhooks/*`,
`/api/agent/checkout`), HMAC-signed rail calls (`runtime = "nodejs"`), and request-time server
components. **Vercel** is the native Next.js host and runs all of it.

## One-time setup — dashboard, ~2 minutes

1. Go to **https://vercel.com** and sign in with **GitHub**.
2. **Add New… → Project → Import Git Repository** → authorize Vercel on your GitHub → pick
   **`iamkn1ght/BazaarKE`**.
3. Vercel auto-detects **Next.js**. Leave the defaults (Framework Preset: Next.js, Build Command:
   `next build`, Output: `.next`, Root Directory: `./`).
4. **Production Branch** — in Project → Settings → Git, set it to **`feat/rail-integration-phase-1`**
   (currently the repo's only branch).
5. **Environment variables — none required.** The Sanity read client has built-in fallbacks
   (`d0fzn4cs` / `sanityyy`) and the dataset is publicly readable, so the catalog renders with zero
   config. *(Optional, to make it explicit:)*
   ```
   NEXT_PUBLIC_SANITY_PROJECT_ID=d0fzn4cs
   NEXT_PUBLIC_SANITY_DATASET=sanityyy
   NEXT_PUBLIC_SANITY_API_VERSION=2022-03-25
   ```
6. Click **Deploy**. ~2 min later you get a public URL (e.g. `bazaar-ke.vercel.app`). Every push to
   the branch auto-redeploys.

## What works on the preview (no rail credentials)

- ✅ Full storefront: home, catalog, product pages, image gallery + lightbox, light/dark mode, the
  cart, and the geocoded delivery-address step — all live.
- ⚠️ Checkout **"Pay with M-Pesa"** returns a graceful `503 temporarily unavailable` — Kipkiren Pay
  isn't provisioned. By design, **every rail degrades gracefully** (503 / inert-log); nothing crashes.

## Going to real production later

Set the rail env vars (see `.env.example`) once Silvia provisions them, provision **Vercel KV**
(`KV_REST_API_URL` + `KV_REST_API_TOKEN`) for webhook dedup, run the KES re-price migration, and
deploy the Kafka consumer as a separate long-running worker (it is **not** a Vercel function). Full
go-live checklist: `docs/DEPLOYMENT_READINESS.md`.

## Alternative: Vercel CLI (if you'd rather drive it from a terminal)

```bash
npm i -g vercel
vercel login          # interactive — opens your browser / emails a code
vercel --yes          # first deploy (preview);  vercel --prod  for production
```

The dashboard route is recommended because it wires up **auto-deploy on every git push**; the CLI
does one-off deploys unless you also link the Git integration.
