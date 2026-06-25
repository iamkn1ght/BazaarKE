# BazaarKE — Rail Integration + Storefront RECAP (v1.3)

**Brand:** BazaarKE (consumer-facing). **Rail identity (unchanged):** app slug `unique_accessories`, legal entity "Unique Accessories Ltd" — as filed in `OPERATOR_REQUEST_*.md`; not renamed until re-provisioned with the operator.
**App:** Next.js 15 App Router + Sanity, editorial light/dark storefront
**Status:** Phase 1 rails CODE-COMPLETE + adversarially verified; geocoded delivery step shipped; **Phase-2 Helpan + Hakken UA scaffolds built (inert, fail-closed)**; storefront redesigned + motion-polished; operator-gated for go-live
**Branch:** `feat/rail-integration-phase-1` (baseline tag `pre-rail-integration`) · **pushed:** github.com/iamkn1ght/BazaarKE
**Latest commit:** `90d2018` — cart item-removal animation (storefront motion pass)
**Data store:** Sanity (project `d0fzn4cs`, dataset `sanityyy`)
**Dedup/cache:** Vercel KV (to provision)
**Domain:** TBD
**Authored:** 24 June 2026 · **updated 26 June 2026**

> Mirrors the Klokd v3 RECAP structure. Master cross-rail tracker: `…\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md`. (Supersedes the pre-rail PayPal app overview, baseline commit `62c9eb8`.)

---

## 1. Headline

PayPal is gone; the storefront is fully rail-aligned: **KES-denominated, M-Pesa-paid (Kipkiren Pay), Identiti-authed, Todoku-communicated, Itafika-delivered**. All four Phase-1 rails are wired, type-checked, lint-clean, **168 unit tests green** (34 at Phase-1 close), production build passes. A multi-agent **adversarial-verify** pass (23 agents, 7 dimensions) confirmed 15 of 16 findings (2 critical, 6 major, 6 minor, 1 nit), **all fixed**. The integration is **engineering-complete and operator-gated**: nothing goes live end-to-end until Silvia delivers credentials and KP deploys; every rail path degrades gracefully (503 / inert-log) when creds are absent.

**Post-Phase-1 delta (24–26 Jun).** (1) The last UA-side go-live gap closed: a **geocoded delivery-address step** at checkout (device-GPS pin + paste fallback, Kenya service-area validated) populates `order.shipping_destination`, plus a graceful-degrade delivery-fee quote — Itafika dispatch flips live the moment the store origin + creds land. (2) The money-critical **KP/Itafika event handlers** were split functional-core/imperative-shell and the orchestration is now unit-tested (the locus of the prior critical bugs). (3) **Phase-2 scaffolds built, inert + fail-closed:** **Helpan** agent-runtime (RS256 delegated-authority verified vs Identiti JWKS, revocation store, dual-role dispatch target, `initiated_by:"agent"` audit) and **Hakken** discovery (§10.7 banned-key + PII walls enforced app-side at any depth, `price_range_kes` banding, isolated three-header auth, `getHakkenJwt` deferral). Each shipped with its own adversarial review — Hakken's caught 2 *critical* leaks (a too-broad `source_payment*` carve-out and a price-band that exposed the exact price on round prices), both fixed before commit. (4) A **motion & micro-interactions** pass (design-motion-principles, Jakub/Emil weighting): custom easing tokens replacing every bare ease curve, removed a looping pulse anti-pattern, and an animated cart-item removal.

Post-Phase-1, the storefront was rebuilt to a world-class editorial standard (New Balance / Adidas / Eastern Edition language) using the installed design skills: Geist type (the Arial-override bug fixed), image-forward hover-zoom product cards, editorial hero, sticky compact nav with a mobile sheet menu, a dark footer, an M-Pesa checkout with a countdown ring + success state, **light/dark mode** (next-themes + semantic tokens), CSS scroll-reveal, a zoom **lightbox**, catalog **filter/sort**, breadcrumbs, related products, an empty-cart state, and route loading skeletons. The consumer brand was renamed **Unique Accessories → BazaarKE** (display + metadata; the rail slug `unique_accessories` is unchanged).

## 2. Commit log

| Commit | Date | What |
|---|---|---|
| `62c9eb8` | (Apr 2026) | Baseline: PayPal-complete storefront (tag `pre-rail-integration`) |
| `638c550` | 23 Jun | Rail integration playbook + startup prompt |
| `09be307` | 23 Jun | Week 1 — PayPal removal + Identiti foundation + KES schema |
| `e9251c8` | 24 Jun | Week 2 — Kipkiren Pay + KES checkout |
| `6f6224a` | 24 Jun | Week 3 — Todoku comms |
| `dfa22f8` | 24 Jun | Week 4 — Itafika last-mile |
| `e00ac82` | 24 Jun | Week 5 — §A.11 hardening, 15 adversarial-verify fixes, Phase 2 design, RECAP |
| `d991f6b` | 24 Jun | Checkout polish — STK-push countdown ring + success state |
| `d929b6f` | 24 Jun | Home — hero above products |
| `439e7d0` | 24 Jun | Editorial storefront redesign (design-taste skill) |
| `61b779f` | 24 Jun | Dark mode, scroll-reveal, lightbox, catalog filter/sort, README |
| `56e1605` | 24 Jun | Polish — breadcrumbs, related products, empty-cart, loading skeletons |
| `c9a377c` | 24 Jun | Rename to BazaarKE + recap update |
| `5f44394` | 24 Jun | Geocoded delivery-address step + delivery-fee quote (BZ-Ops gap closed) |
| `f021c56` | 25 Jun | Unit-test money-critical KP/Itafika handlers (functional-core/shell split) |
| `7729ebd` | 25 Jun | Helpan Phase-2 agent-runtime integration (inert, fail-closed) — BZ-P2-Hp |
| `2ce40e9` | 25 Jun | Hakken Phase-2 discovery integration (inert, fail-closed) — BZ-P2-Hk |
| `df636b9` | 25 Jun | Storefront motion pass — custom easing, pulse anti-pattern, card legibility |
| `90d2018` | 26 Jun | Cart item-removal animation (meaningful exit) |

## 3. Sprint state

| Week | Title | Status | Notes |
|---|---|---|---|
| 1 | PayPal removal + Identiti | 🟢 DONE | 3 routes/lib/dep/4 env vars removed; shared HMAC signer; Identiti client; anonymous-express auth; additive schema |
| 2 | Kipkiren Pay | 🟢 DONE | money.ts; client (charges/payouts/holds); Kafka consumer + inert HTTP webhook; checkout; KES end-to-end |
| 3 | Todoku | 🟢 DONE | client; 8 templates; notifyAccount; wired to KP events; partial-failure safe |
| 4 | Itafika | 🟢 DONE | asymmetric signer (base64/hex + bodyless-GET); client; main-loop webhook; reconciliation observe-only |
| 5 | Hardening + Phase 2 design | 🟢 DONE | §A.11 audit; adversarial-verify (15 fixes); Hakken/Helpan operator requests; RECAP; deployment readiness |
| Polish | Storefront redesign | 🟢 DONE | Editorial NB/Adidas/Eastern-Edition pass; Geist font fix; image-forward cards; hero; sticky nav + mobile menu; dark footer |
| Polish | UX features | 🟢 DONE | Light/dark mode (next-themes + tokens); CSS scroll-reveal; gallery lightbox; catalog filter/sort; breadcrumbs; related products; empty-cart; loading skeletons |
| Polish | Brand rename | 🟢 DONE | Unique Accessories → **BazaarKE** (display + metadata). Rail slug `unique_accessories` + legal entity unchanged |
| BZ-Ops | Geocoded delivery step | 🟢 DONE | Required + server-validated `shipping_destination` (GPS pin / paste, KE service-area); graceful delivery-fee quote; un-inerts Itafika dispatch once origin+creds land |
| Tests | Money-critical handler coverage | 🟢 DONE | KP/Itafika handlers → functional-core/shell; orchestration unit-tested (forward-only, dedup claim/release, side-effects-only-on-apply, swallowed comms failures) |
| BZ-P2-Hp | Helpan agent runtime | 🟢 BUILT (inert) | RS256 delegated-authority (vs Identiti JWKS) + claim validation; revocation store + AUTHORITY_REVOKED webhook; dual-role `/api/agent/checkout`; `initiated_by:"agent"` audit; fail-closed |
| BZ-P2-Hk | Hakken discovery | 🟢 BUILT (inert) | §10.7 banned-key + PII walls (any-depth, fail-closed); `price_range_kes` band; isolated three-header auth; vertical-isolation filter; `getHakkenJwt` deferral |
| Polish | Storefront motion pass | 🟢 DONE | design-motion-principles (Jakub/Emil): custom easing tokens (no bare ease); removed looping-pulse anti-pattern; perf-aware scroll-reveal; animated cart-item removal |

## 4. Deployment + test state

| Item | Value |
|---|---|
| `npm run lint` | ✅ clean |
| `npx tsc --noEmit` | ✅ clean |
| `npm run test` | ✅ 168/168 (`node:test` via `node --conditions=react-server --import tsx`) |
| `npm run build` | ✅ 20 routes (+`/api/agent/checkout`, `/api/webhooks/helpan`, `/api/checkout/delivery-quote`) |
| Rail health | Identiti/Todoku/Itafika `200`; KP DNS unresolved (not deployed) |
| Local run | ✅ browser-verified — KES storefront + M-Pesa checkout UI |
| Production deploy | ❌ not done — operator-gated (see §7 + `docs/DEPLOYMENT_READINESS.md`) |

## 5. Cross-rail joint status

| Rail | Producer-side (Silvia/operator) | UA-side |
|---|---|---|
| **Identiti** | `unique_accessories_sandbox` secret pending (4th in stale-secret queue); HTTP webhooks at ID-14 | ✅ client, auth, inert webhook, `aud=hakken` design ask filed |
| **Kipkiren Pay** | KP-1-Ops deploy + secret + tier_3 account + Kafka creds pending; no HTTP signer | ✅ client, money.ts, Kafka consumer + inert HTTP webhook, checkout |
| **Todoku** | tenant + 8 ULIDs + secret + UAKE sender (2-4wk CA-K) pending | ✅ client, templates, notify wired to KP + Itafika events |
| **Itafika** | anchor + secret + callback URL pending; OPS-4 + KP acct for KP-16 | ✅ asymmetric signer, client, main-loop webhook, dispatch (inert w/o geo) |
| **Hakken** (P2) | `unique_accessories_v1` plugin + secret + Identiti `aud=hakken` JWT pending | 🟢 UA scaffold **built + inert** (`app/lib/rails/hakken/*`) — §10.7 banned-key + PII walls (fail-closed, any depth), `price_range_kes` banding, isolated three-header auth, vertical-isolation filter, `getHakkenJwt` deferral; 25 tests. Operator side still 🟠 (`OPERATOR_REQUEST_HAKKEN.md`) |
| **Helpan** (P2) | `helpan-unique-accessories-v1` agent + 3 secrets + Identiti JWKS DA key pending | 🟢 UA scaffold **built + inert** (`app/lib/rails/helpan/*`, `/api/agent/checkout`, `/api/webhooks/helpan`) — fail-closed delegated authority (RS256 vs JWKS), revocation store, dual-role dispatch target, `initiated_by:"agent"` audit; 38 tests. Operator side still 🟠 (`OPERATOR_REQUEST_HELPAN.md`) |

## 6. Adversarial-verify outcome (Week 5)

23 agents · 7 dimensions · 16 findings · 15 confirmed · **15 fixed**:

- **Critical (2):** (a) dedup claim-then-crash — a transient Sanity failure after claiming the dedup key permanently dropped the event (money-state loss) → now releases the key on failure so redelivery recovers; (b) checkout not idempotent — a retried Pay click double-created orders + double STK push → now a stable client `checkout_attempt_id` drives the doc id + KP idempotency key + customer-create, with a short-circuit on an existing charge.
- **Major (6):** unpriced-product render crash + schema root cause (guard + `price_minor` required); order state-machine clobbering (forward-only transition guards, KP + Itafika); guest `createCustomer` orphans on retry (per-attempt idempotency); KP + Itafika audit rows missing `traceparent` (now recovered from the order).
- **Minor/nit (7):** cart line showed unit not line total; unbounded quantity (capped + safe-int); unsigned Itafika event-header merge (dropped + enum allowlist); `unknown` dedup collision (id-less → non-dedupable); charge audit missing `request_id` (threaded); short dedup TTL (→ 24h); orphan-PENDING on charge failure (patched to FAILED).

## 7. Outstanding blockers

**Operator (Silvia):** Identiti sandbox secret (queue) + multi-audience minting for `aud=hakken` + JWKS delegated-authority key (Helpan); KP-1-Ops deploy + secret + tier_3 + Kafka creds + HTTP signer; Todoku tenant/ULIDs/secret/UAKE; Itafika anchor/secret/callback + OPS-4; Hakken plugin/secret; Helpan agent/secrets. **Chamia:** CHAMIA-ENTITY registration date (gates KP tier_3). **UA:** provision Vercel KV; deploy the Kafka consumer worker; run the KES re-price migration; set `ITAFIKA_ORIGIN_LAT/LNG` (store pickup point — last gate to un-inert dispatch now that the delivery step ships). Full checklist: `docs/DEPLOYMENT_READINESS.md`.

## 8. Architecture invariants (locked)

| ID | Invariant |
|---|---|
| AD-1 | No third-party payment/comms/identity SDKs — rails only (no PayPal, Daraja, AT, Twilio, WhatsApp direct) |
| AD-2 | KES integer minor units everywhere; no float money; `*_minor` carry `Rule.integer().min(0)` |
| AD-3 | Rail base URLs from env only; `PAYMENT_RAIL_*` never `KIPKIREN_*` (survives Phase-3 LipaStack flip) |
| AD-4 | Money Rule: KP/Itafika webhooks + reconciliation + refund = main-loop only |
| AD-5 | Webhooks: `runtime='nodejs'`, raw-bytes → constant-time verify → JSON.parse; KV dedup (never Sanity) |
| AD-6 | Raw MSISDN/PII never leave Identiti; phone tokens minted fresh per send |
| AD-7 | §A.11: every `rail_audit` row carries `traceparent` + `business_op_id` (+ `request_id` on outbound) |
| AD-8 | State writes forward-only (guarded by current state); idempotency keys stable per business-op |

## 9. Reference index

- **Docs:** `docs/RAIL_INTEGRATION_PLAYBOOK.md`, `docs/KMV_RAILS_INTEGRATION_GUIDE.md` (wire), `docs/PAYPAL_REMOVAL_RUNBOOK.md` + `_RESULT.md`, `docs/{KP,TODOKU,ITAFIKA}_INTEGRATION_RESULT.md`, `docs/DEPLOYMENT_READINESS.md`
- **Operator requests:** `OPERATOR_REQUEST_{CHAMIA,IDENTITI,KP,TODOKU,ITAFIKA,HAKKEN,HELPAN}.md`
- **Smoke:** `npm run smoke:{identiti,payment-rail,todoku,itafika}`
- **Rail code:** `app/lib/rails/{_shared,identiti,payment-rail,todoku,itafika,helpan,hakken}/`; webhooks `app/api/webhooks/{identiti,payment-rail,itafika,helpan}/`; checkout `app/api/checkout/{initiate,status,delivery-quote}/`; agent dispatch target `app/api/agent/checkout/`

## 10. Tech debt

- ~~Handler-level integration tests deferred.~~ **Done:** KP/Itafika handlers split functional-core/imperative-shell; orchestration unit-tested via injected deps. Suite is now **168 tests** (was 34): + geocoded-delivery geo helpers, dedup/trace, KP/Itafika transitions + orchestration, Helpan (authority/RS256/revocation/dispatch/webhook), Hakken (containment walls/banding/three-header). Tests run under `node --conditions=react-server` (`server-only` devDep → inert stub).
- ~~Checkout lacks a geocoded shipping-address step.~~ **Done** (`5f44394`) — remaining gate is operator-side `ITAFIKA_ORIGIN_*`.
- README "Checkout flow" still describes PayPal — rewrite for the KP STK-push flow before launch.
- Cart carries `price_minor`; until `npm run migrate:sanity -- --apply` runs, products fall back to `price*100` (catalog prices are placeholder test data, e.g. KES 20 AirPods).
- Phase-2 go-live (Helpan/Hakken) needs Identiti multi-audience JWTs + JWKS DA key + the respective plugin/agent registration before the inert scaffolds activate.

---

*BazaarKE Rail Integration + Storefront RECAP v1.3 · updated 26 June 2026 · Phase 1 code-complete + adversarially verified; geocoded delivery step shipped; Phase-2 Helpan + Hakken UA scaffolds built (inert, fail-closed); storefront motion-polished; operator-gated · Delta from v1.2: delivery step, money-critical handler tests, Helpan + Hakken Phase-2 scaffolds (+134 tests → 168), storefront motion pass*
