# PayPal Removal Runbook

**App:** Unique Accessories (Next.js 15 + Sanity)
**Authored:** 23 June 2026 · Week 1, `feat/rail-integration-phase-1`
**Authority:** `docs/RAIL_INTEGRATION_PLAYBOOK.md` §4 (PayPal removal) · §2.1 Cardinal Rule (apps never call third-party payment providers directly)
**Rollback point:** tag `pre-rail-integration` (commit `62c9eb8` on `master`) — the last PayPal-complete build.

> Cardinal Rule: after this runbook, there is **zero PayPal** in the repo — no env vars, no dependency, no code. PayPal is replaced by **Kipkiren Pay** (KP), wired in Week 2. Week 1 leaves checkout in a deliberate **placeholder** state (KP component lands Week 2).

---

## 0. Why this is safe

Per playbook §4.5 and `recap.md`, there are **no real customers** — the storefront is at "content population" stage. There is no live order flow to cut over and no customer-state migration. The only PayPal data is test `order` documents in the dev/staging Sanity dataset, handled by **CHAMIA-DATASET-CLEANUP** (tag `legacy: 'paypal'`, do not drop).

---

## 1. Inventory

### DELETE (PayPal-only code — paths verified on disk)
| Path | What it is |
|---|---|
| `app/api/paypal/create-order/route.ts` | PayPal Orders API v2 create-order route |
| `app/api/paypal/capture-order/route.ts` | Capture + persist-to-Sanity route |
| `app/api/paypal/webhook/route.ts` | Signed PayPal webhook receiver |
| `app/lib/paypal.ts` | Server-only PayPal client (auth, create, capture, verify) — ⚠ at **`app/lib/`**, NOT top-level `lib/` (`rm lib/paypal.ts` deletes nothing) |
| `app/components/CheckoutNow.tsx` | `<PayPalButtons>` checkout component |

After deletion the `app/api/paypal/` directory is empty and is removed.

### MODIFY (keep the file, change it)
| Path | Change |
|---|---|
| `app/components/Providers.tsx` | Remove `<PayPalScriptProvider>` + its import; flip `<USCProvider currency="USD">` → `"KES"`. (Identiti auth provider added in the auth-flow step.) |
| `app/components/ShoppingCartModal.tsx` | Remove `import CheckoutNow` + `<CheckoutNow />`; replace with a temporary "Checkout is being upgraded to M-Pesa" placeholder until the Week-2 `KipkirenPayCheckout.tsx` lands. |
| `package.json` | Remove dependency `@paypal/react-paypal-js`. |
| `.env.example` | Remove the 4 PayPal vars (below); fix `NEXT_PUBLIC_SANITY_DATASET` → `sanityyy` (CHAMIA-SANITY-DATASET); add the Phase-1 rail var stubs. |
| `README.md` | Replace the "Checkout flow" / PayPal env-var sections with the KP/rail equivalents (can trail until Week 2 once KP UX exists; note inline that checkout is mid-migration). |

### KEEP (do **not** delete)
- `app/lib/sanity.ts`, `app/lib/sanity-write.ts` — the KP capture webhook (Week 2) reuses the write client to persist orders.
- `sanity/schemaTypes/*` — `product`, `category`, `heroImage`, `order` are **extended** additively (separate schema task), never dropped. Legacy `order` fields `shippingAddress` + `rawCapture` are retained.
- All other UI (`Navbar`, `Hero`, `Newest`, `AddToBag`, `imageGallery`, product/category/all pages).

---

## 2. Env var changes

**Purge (delete) — PayPal:**
```
NEXT_PUBLIC_PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_API_BASE
PAYPAL_WEBHOOK_ID
```
Remove from `.env.example`, local `.env`, and the Vercel project (all environments).

**Keep:** `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET` (set to `sanityyy`), `NEXT_PUBLIC_SANITY_API_VERSION`, `SANITY_API_TOKEN`.

**Add (Phase-1 rail stubs — see the 4 `OPERATOR_REQUEST_*.md`):**
```
# Identiti (hex-64 secret)
IDENTITI_API_BASE=https://identiti-production.up.railway.app
IDENTITI_APP_ID=unique_accessories_sandbox
IDENTITI_APP_SECRET=            # hex-64, from Silvia / 1Password
# Kipkiren Pay (base64url-43 secret; AD-K06: PAYMENT_RAIL_*, never KIPKIREN_*)
PAYMENT_RAIL_API_BASE=          # TBD — KP not yet deployed (KP-1-Ops)
PAYMENT_RAIL_APP_ID=unique_accessories_sandbox
PAYMENT_RAIL_APP_SECRET=        # base64url-43
PAYMENT_RAIL_AUDIENCE=kipkiren_pay
# PAYMENT_RAIL_WEBHOOK_SECRET — DEFERRED (KP is Kafka-only today, no HTTP signer)
# Todoku (base64url-43 secrets)
TODOKU_API_BASE=https://todoku-prod-production.up.railway.app
TODOKU_APP_ID=unique_accessories
TODOKU_APP_SECRET=              # base64url-43
TODOKU_WEBHOOK_SECRET=         # base64url-43
# Itafika (hex-64 secret; same secret signs both directions — no separate webhook secret)
ITAFIKA_BASE_URL=https://itafika-production.up.railway.app
ITAFIKA_APP_ID=unique_accessories
ITAFIKA_APP_SECRET=            # hex-64, from Silvia / 1Password
```

---

## 3. Execution order

1. **Schema first (additive)** — extend `order`/`product` so nothing references a field that doesn't exist yet (separate task; safe, additive).
2. **Delete** the 5 PayPal files; remove the empty `app/api/paypal/` dir.
3. **Fix the import break** — `ShoppingCartModal.tsx` imports `CheckoutNow`; replace with the placeholder *before* building or the build fails.
4. **Modify** `Providers.tsx` (drop `PayPalScriptProvider`, `USD`→`KES`).
5. **Dependency** — `npm uninstall @paypal/react-paypal-js`; confirm it's gone from `package.json` + lockfile.
6. **Env** — purge 4 PayPal vars; fix dataset; add rail stubs in `.env.example`.
7. **Data** — run `scripts/migrate-sanity-paypal-to-kp.ts` (re-price KES `price_minor`; tag legacy orders `legacy:'paypal'`).
8. **Verify** (§4).

---

## 4. Verification (acceptance)

- `grep -ri "paypal" app/ components/ lib/ sanity/ .env.example package.json` → **no matches** (case-insensitive). The only allowed surviving mention of "PayPal" is in `docs/` (this runbook, the result doc, the legacy-order tag value `'paypal'`, and historical notes).
- `npm run lint` → clean.
- `npm run build` → compiles; route list **no longer contains** `/api/paypal/*`.
- `package.json` + `package-lock.json` → no `@paypal/react-paypal-js`.
- Cart modal renders the placeholder without referencing PayPal.
- Document the outcome in `docs/PAYPAL_REMOVAL_RESULT.md`.

---

## 5. Rollback

```
git checkout master            # PayPal-complete baseline
git checkout pre-rail-integration -- .   # or hard reset the feature branch to the tag
```
The tag `pre-rail-integration` (`62c9eb8`) is the verified-green PayPal build; nothing in this runbook is irreversible.

---

## 6. Customer comms

**None required** — no real customers (playbook §4.5). No emails, no notices.

---

*PayPal Removal Runbook · Unique Accessories · 23 June 2026 · rollback tag `pre-rail-integration`*
