# PayPal Removal + Identiti Foundation — Result (Week 1)

**Branch:** `feat/rail-integration-phase-1` · **Date:** 23 June 2026
**Rollback:** tag `pre-rail-integration` (commit `62c9eb8`)
**Verification:** `npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run test` ✓ (14/14) · `npm run build` ✓

Executes `docs/PAYPAL_REMOVAL_RUNBOOK.md` and the Week-1 Identiti foundation.

---

## Done

### PayPal removed (Cardinal Rule — zero third-party payment code)
- Deleted: `app/api/paypal/{create-order,capture-order,webhook}/route.ts`, `app/lib/paypal.ts`, `app/components/CheckoutNow.tsx`, and the empty `app/api/paypal/` dir.
- Uninstalled `@paypal/react-paypal-js` (gone from `package.json` + lockfile).
- `Providers.tsx`: removed `<PayPalScriptProvider>`; cart currency `USD` → `KES` (`language="en-KE"`).
- `ShoppingCartModal.tsx`: `<CheckoutNow>` replaced with an interim placeholder ("Checkout is being upgraded to M-Pesa"); `$` → `KES`.
- `.env.example`: 4 PayPal vars purged; dataset fixed to `sanityyy` (CHAMIA-SANITY-DATASET); Phase-1 rail var stubs added with per-rail secret-encoding notes.
- Build route list confirms `/api/paypal/*` is gone. Only intentional "paypal" strings remain (legacy schema group, migration script, the `legacy:'paypal'` tag value, docs, and an unrelated transitive-dep funding URL in the lockfile).

### Identiti foundation
- `app/lib/rails/_shared/signRequest.ts` — shared per-request HMAC signer: **base64** outer signature, **hex** body-hash, `/v1/`-prefixed path, **empty Content-Type on GET**, RFC 3339 timestamp, UUIDv4 idempotency on writes. Pure utility (no `server-only` guard — holds no secret; unit-tested).
- `app/lib/rails/_shared/railFetch.ts` — signed fetch + `{ok,data,meta}` envelope unwrap + `RailError`; sends the exact signed bytes; `traceparent` propagation. `server-only`.
- `app/lib/rails/identiti/{client,types,index}.ts` — `createCustomer`, `issueCustomerToken` (aud=unique_accessories), `mintPhoneToken` (audience=todoku), `createStepUpChallenge` + `verifyStepUp`, `getCustomerTier`. hex-64 secret validation. **`/v1/phone-tokens/resolve` deliberately omitted** (403); tier at `/v1/customers/{uuid}/tier` (not `/accounts`).
- `app/api/webhooks/identiti/route.ts` — inert receiver (`runtime='nodejs'`, raw-bytes-before-parse, 300s replay, base64 verify); returns 503 until `IDENTITI_WEBHOOK_SECRET` lands at ID-14. Routes KYC_TIER_CHANGED / SIM_SWAP_DETECTED / ACCOUNT_DEACTIVATED.

### Auth (CHAMIA-AUTH = anonymous express + upsell)
- `app/lib/auth/session.ts` (httpOnly cookie), `app/lib/auth/actions.ts` (`signUpAction`, `loginAction`, `logoutAction` — server actions, redirect-based so no React-19-only hooks), `components/ui/input.tsx`, `app/signup/page.tsx`, `app/login/page.tsx`. Signup creates an Identiti customer; raw MSISDN never stored (`app_correlation` is an opaque UUID).

### Sanity schema (additive)
- `product`: added `price_minor` (`Rule.integer().min(0)`); `price` retained as legacy.
- `order`: added rail group (`account_uuid`, `state`, `total_minor`, `currency`, `kp_charge_id`, `itafika_job_id`, minor-unit `items`), audit group (`traceparent`, `business_op_id`, `rail_audit[]`), and `legacy` tag; PayPal fields + `shippingAddress` + `rawCapture` retained in a legacy group. Every `*_minor` carries `Rule.integer().min(0)`.
- `scripts/migrate-sanity-paypal-to-kp.ts` — dry-run by default; re-prices `price_minor` major→minor (no FX, CHAMIA-CURRENCY) and tags legacy orders `legacy:'paypal'` (CHAMIA-DATASET-CLEANUP). Products with no usable price are reported for manual re-pricing, not guessed.

### Tests + docs
- 14 unit tests on the signer (`node:test` via tsx) — canonical assembly, base64-not-hex output, GET empty-CT, idempotency-on-write, constant-time verify. `npm run test`.
- `scripts/smoke-identiti.ts` (`npm run smoke:identiti`) — mirrors the rail smoke recipe.
- `docs/KMV_RAILS_INTEGRATION_GUIDE.md` mirrored; `OPERATOR_REQUEST_CHAMIA.md` + 4 rail operator requests + this result doc + the runbook authored.

---

## Blocked / deferred (not Week-1 failures)

| Item | Status |
|---|---|
| `unique_accessories_sandbox` Identiti HMAC secret | Blocked — 4th in operator queue behind 3 stale secrets (master RECAP §8 item 1). `smoke-identiti.ts` cannot run until delivered. |
| KP rail | Not deployed (KP-1-Ops); `PAYMENT_RAIL_API_BASE` TBD. KP work is Week 2. |
| Identiti HTTP webhooks | Kafka-only until ID-14; receiver inert (503). |
| Phone login (OTP) | `loginAction` is a notice-only stub — the Identiti customer-token factor / aud=hakken multi-audience contract is pending (`OPERATOR_REQUEST_IDENTITI.md`). |
| Server-authoritative cart hydration | Deferred — cart stays client-only (`use-shopping-cart` persisted). Sanity cart-doc sync is a Week-2 follow-up. |
| KES checkout UX | Placeholder in the cart modal until the Week-2 `KipkirenPayCheckout.tsx`. |
| CHAMIA-ENTITY registration date | Outstanding — gates KP corporate `tier_3`; tracked in `OPERATOR_REQUEST_KP.md`. |

---

## Tech debt / notes
- `vitest` was attempted but hits `ERR_REQUIRE_ESM` (`std-env`) on Node 22.11; tests use the built-in `node:test` runner instead.
- README's PayPal "Checkout flow" section will be rewritten when the Week-2 KP UX lands (checkout is mid-migration).
