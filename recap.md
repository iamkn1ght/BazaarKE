# Unique Accessories — Rail Integration RECAP (v1.0)

**App:** Unique Accessories (Next.js 15 App Router + Sanity)
**Status:** Phase 1 CODE-COMPLETE across all 4 critical rails; operator-gated for go-live
**Branch:** `feat/rail-integration-phase-1` (baseline tag `pre-rail-integration`)
**Latest commit:** Week 5 (hardening + Phase 2 design)
**Data store:** Sanity (project `d0fzn4cs`, dataset `sanityyy`) — no separate DB
**Dedup/cache:** Vercel KV (to provision)
**Domain:** TBD
**Authored:** 24 June 2026

> Mirrors the Klokd v3 RECAP structure. Master cross-rail tracker: `…\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md`. (Supersedes the pre-rail PayPal app overview — see baseline commit `62c9eb8`.)

---

## 1. Headline

PayPal is gone; the storefront is fully rail-aligned — **KES-denominated, M-Pesa-paid (Kipkiren Pay), Identiti-authed, Todoku-communicated, Itafika-delivered**. All four Phase-1 rails are wired, type-checked, lint-clean, 34 unit tests green, and the production build passes. A multi-agent **adversarial-verify** pass (23 agents, 7 dimensions) found 16 issues, confirmed 15 (2 critical, 6 major, 6 minor, 1 nit) — **all 15 fixed** this sprint. The integration is **engineering-complete and operator-gated**: nothing goes live end-to-end until Silvia delivers credentials and KP deploys. Every rail path degrades gracefully (503 / inert-log) when creds are absent — no crashes, no PayPal residue.

## 2. Commit log

| Commit | Date | What |
|---|---|---|
| `62c9eb8` | (Apr 2026) | Baseline: PayPal-complete storefront (tag `pre-rail-integration`) |
| `638c550` | 23 Jun | Rail integration playbook + startup prompt |
| `09be307` | 23 Jun | Week 1 — PayPal removal + Identiti foundation + KES schema |
| `e9251c8` | 24 Jun | Week 2 — Kipkiren Pay + KES checkout |
| `6f6224a` | 24 Jun | Week 3 — Todoku comms |
| `dfa22f8` | 24 Jun | Week 4 — Itafika last-mile |
| _(this)_ | 24 Jun | Week 5 — §A.11 hardening, 15 adversarial-verify fixes, Phase 2 design, RECAP |

## 3. Sprint state

| Week | Title | Status | Notes |
|---|---|---|---|
| 1 | PayPal removal + Identiti | 🟢 DONE | 3 routes/lib/dep/4 env vars removed; shared HMAC signer; Identiti client; anonymous-express auth; additive schema |
| 2 | Kipkiren Pay | 🟢 DONE | money.ts; client (charges/payouts/holds); Kafka consumer + inert HTTP webhook; checkout; KES end-to-end |
| 3 | Todoku | 🟢 DONE | client; 8 templates; notifyAccount; wired to KP events; partial-failure safe |
| 4 | Itafika | 🟢 DONE | asymmetric signer (base64/hex + bodyless-GET); client; main-loop webhook; reconciliation observe-only |
| 5 | Hardening + Phase 2 design | 🟢 DONE | §A.11 audit; adversarial-verify (15 fixes); Hakken/Helpan operator requests; RECAP; deployment readiness |

## 4. Deployment + test state

| Item | Value |
|---|---|
| `npm run lint` | ✅ clean |
| `npx tsc --noEmit` | ✅ clean |
| `npm run test` | ✅ 34/34 (`node:test` via tsx) |
| `npm run build` | ✅ 17 routes |
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
| **Hakken** (P2) | `unique_accessories_v1` plugin + secret pending | 🟠 design ask filed (`OPERATOR_REQUEST_HAKKEN.md`) |
| **Helpan** (P2) | `helpan-unique-accessories-v1` agent + 3 secrets pending | 🟠 design ask filed (`OPERATOR_REQUEST_HELPAN.md`) |

## 6. Adversarial-verify outcome (Week 5)

23 agents · 7 dimensions · 16 findings · 15 confirmed · **15 fixed**:

- **Critical (2):** (a) dedup claim-then-crash — a transient Sanity failure after claiming the dedup key permanently dropped the event (money-state loss) → now releases the key on failure so redelivery recovers; (b) checkout not idempotent — a retried Pay click double-created orders + double STK push → now a stable client `checkout_attempt_id` drives the doc id + KP idempotency key + customer-create, with a short-circuit on an existing charge.
- **Major (6):** unpriced-product render crash + schema root cause (guard + `price_minor` required); order state-machine clobbering (forward-only transition guards, KP + Itafika); guest `createCustomer` orphans on retry (per-attempt idempotency); KP + Itafika audit rows missing `traceparent` (now recovered from the order).
- **Minor/nit (7):** cart line showed unit not line total; unbounded quantity (capped + safe-int); unsigned Itafika event-header merge (dropped + enum allowlist); `unknown` dedup collision (id-less → non-dedupable); charge audit missing `request_id` (threaded); short dedup TTL (→ 24h); orphan-PENDING on charge failure (patched to FAILED).

## 7. Outstanding blockers

**Operator (Silvia):** Identiti sandbox secret (queue); KP-1-Ops deploy + secret + tier_3 + Kafka creds + HTTP signer; Todoku tenant/ULIDs/secret/UAKE; Itafika anchor/secret/callback + OPS-4; Hakken plugin/secret; Helpan agent/secrets. **Chamia:** CHAMIA-ENTITY registration date (gates KP tier_3). **UA:** provision Vercel KV; deploy the Kafka consumer worker; run the KES re-price migration; add a geocoded shipping-address step (gates Itafika dispatch + delivery-fee quote). Full checklist: `docs/DEPLOYMENT_READINESS.md`.

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
- **Rail code:** `app/lib/rails/{_shared,identiti,payment-rail,todoku,itafika}/`; webhooks `app/api/webhooks/{identiti,payment-rail,itafika}/`; checkout `app/api/checkout/{initiate,status}/`

## 10. Tech debt

- Handler-level integration tests (dedup release, forward-only transitions, webhook verify) need a Sanity/KV mock harness — deferred (the logic is adversarial-verify-confirmed; signing + money + price-guard are unit-tested, 34 cases).
- README "Checkout flow" still describes PayPal — rewrite for the KP STK-push flow before launch.
- Cart carries `price_minor`; until `npm run migrate:sanity -- --apply` runs, products fall back to `price*100`.
- Checkout lacks a geocoded shipping-address step → Itafika dispatch + cart delivery-fee quote are wired-but-inert.

---

*Unique Accessories Rail Integration RECAP v1.0 · 24 June 2026 · Phase 1 code-complete, operator-gated · Major delta from baseline: PayPal removed, 4 rails integrated, 15 adversarial-verify fixes*
