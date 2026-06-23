# Startup Prompt — Unique Accessories ← KMV 6-Rail Integration

> **Purpose:** Paste the fenced block below into a fresh Claude Code session opened at `C:\unique_accessories\` to bootstrap the 6-rail KMV integration (Phase 1: Identiti + Kipkiren Pay + Todoku + Itafika; Phase 2 optional: Hakken + Helpan AI). Includes the PayPal removal that's required before KP can land. 5-week plan; pre-flight, hard rules, hard blockers are all in scope.

---

```
You are Claude Code working at C:\unique_accessories\.

This session: integrate Unique Accessories (a Next.js 15 + Sanity CMS e-commerce
storefront currently on PayPal) into the KMV platform's six rails AND remove the
existing PayPal integration. Phase 1 = critical 4 rails (Identiti + Kipkiren Pay +
Todoku + Itafika). Phase 2 = optional 2 (Hakken + Helpan AI, design only this round).
PayPal removal is required before KP can land — they're the same integration in
practice. 5-week plan.

AUTHORITY DOCS (read in order — first 4 are mandatory before opening any source):
1. docs/RAIL_INTEGRATION_PLAYBOOK.md   (cross-cutting playbook for this app — your map)
   AND read §0.5 Day-0 hard gates FIRST — must answer before Week 1.
2. C:\Projects\Klokd\KMV_RAILS_INTEGRATION_GUIDE.md  (authoritative wire-format reference,
                                                    871 lines, overrides operator packs).
   MIRROR LOCALLY to docs/KMV_RAILS_INTEGRATION_GUIDE.md at Week 1 Day 1 (don't keep
   cross-repo dependency on Klokd's repo state).
3. c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\may23rd\Platform Rails Integration and reboot\Platform_Rails_Reboot_Pack_v1_3.md
                                                   (six-rail framing — note may23rd
                                                    subfolder; v1_3 is NOT at the
                                                    canonical-folder root)
4. c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\may23rd\Platform Rails Integration and reboot\App_Integration_Guide_v1_1.md
                                                   (canonical cross-rail patterns;
                                                    v1_0 at root is HISTORICAL —
                                                    don't read that one)
5. c:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md
                                                   (master rail state, 23 Jun 2026 —
                                                    §1.3 every rail row + §5 + §8)
6. C:\Projects\Klokd\docs\HAKKEN_INTEGRATION_REFERENCE.md  (canonical Hakken wire — Phase 2)
7. C:\Projects\lunch drop\docs\ITAFIKA_INTEGRATION_REFERENCE.md
                                                   (canonical Itafika wire — Silvia 22 Jun)
8. C:\Projects\Klokd\docs\HAKKEN_ITAFIKA_INTEGRATION_PLAYBOOK.md
                                                   (cross-rail patterns to emulate)
9. C:\Projects\Klokd\RECAP.md (Klokd v3 RECAP v1.2 — the gold standard for what a
                              consumer-app integration RECAP looks like; mirror its
                              structure for your own RECAP.md when you write one)
10. recap.md    (this app's current state — Next.js 15 + Sanity + PayPal)
11. README.md   (existing setup + checkout flow description)
12. .env.example (current env vars — PayPal-shaped; will be replaced)

LAST-KNOWN STATE (per master RECAP 23 Jun 2026):
- This app: Next.js 15 App Router + TS + Tailwind + shadcn/ui + Sanity (CMS + order
  store) + use-shopping-cart + PayPal. 3 PayPal API routes, ~430 LOC of PayPal code.
  No real customers yet (per recap.md: "largely content population"). Safe migration.
- 5 of 6 rails in code stasis 11-23 Jun (KP, Identiti, Todoku, Helpan AI, Hakken —
  idle 12-17 days) while consumer apps + Itafika raced.
- Itafika IT-S5 LIVE-VERIFIED on dev 22 Jun (signed POST /v1/jobs → 201).
- Klokd v3 Sprint 5 closed 23 Jun (Hakken Phase 1 LIVE; adversarial-verify caught
  2 critical + 4 major bugs pre-merge).
- KWS region resolved 15 Jun to eu-west-1 (platform standard).
- 3 stale Identiti integrator HMAC secrets at operator (14-20 days) — the
  platform-wide critical block per master RECAP §8. Your unique_accessories_sandbox
  secret will be the 4th in line.
- Identiti customer-JWT issuance for aud=hakken is the NEW critical escalation
  surfaced 23 Jun (adversarial-verify + Klokd Sprint 5 close). Will affect your
  Phase 2 Hakken integration.

SCOPE (Phase 1 + Phase 2 design — see playbook §7 for full 5-week plan):

WEEK 1 — PayPal removal + Identiti foundation:
  - Confirm Day-0 hard gates signed (CHAMIA-CURRENCY / CHAMIA-SANITY-DATASET /
    CHAMIA-LOGISTICS / CHAMIA-ENTITY / CHAMIA-AUTH / CHAMIA-DATASET-CLEANUP).
    BLOCK if any are unsigned.
  - Mirror C:\Projects\Klokd\KMV_RAILS_INTEGRATION_GUIDE.md → docs/KMV_RAILS_INTEGRATION_GUIDE.md.
  - Author docs/PAYPAL_REMOVAL_RUNBOOK.md.
  - Author 4 OPERATOR_REQUEST files at repo root (one per Phase-1 rail) for Silvia.
  - DELETE (paths corrected — paypal.ts is at app/lib/, NOT top-level lib/):
    app/api/paypal/*, app/lib/paypal.ts, @paypal/react-paypal-js dep, PayPal env vars
    (NEXT_PUBLIC_PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_API_BASE,
    PAYPAL_WEBHOOK_ID), <PayPalScriptProvider> in Providers.tsx, CheckoutNow.tsx.
  - MODIFY (don't delete):
    - Providers.tsx — flip <USCProvider currency="USD"> to "KES" alongside
      PayPalScriptProvider deletion (otherwise cart prices display $ on KES values).
    - app/lib/sanity-write.ts — KEEP as-is; KP webhook will use it.
  - Scaffold app/lib/rails/_shared/signRequest.ts (single shared HMAC helper for 4
    cross-cutting rails per KMV guide §2) + app/lib/rails/identiti/client.ts.
  - Wire Identiti surfaces (CORRECTED paths):
    - POST /v1/customers (signup)
    - POST /v1/auth/customer-token (login; aud=unique_accessories)
    - POST /v1/phone-tokens (mint, audience=todoku) — NOT /v1/phone-tokens/resolve,
      which is Todoku-internal scope and 403s for app callers
    - POST /v1/stepup/challenges + POST /v1/stepup/verify
      (operation_kind = kipkiren_pay.payout.initiate for KP-bound refunds;
       UA-specific kinds need an operator request to Silvia first)
    - GET /v1/customers/{uuid}/tier — NOT /v1/accounts/{uuid}/tier (404)
  - Webhook events to subscribe (3 only): KYC_TIER_CHANGED, SIM_SWAP_DETECTED
    (re-mint phone token + force re-auth), ACCOUNT_DEACTIVATED. PHONE_CHANGED
    and ACCOUNT_SUSPENDED do NOT exist as Identiti events.
  - Author app/login + app/signup pages (server actions, shadcn/ui).
  - Sanity schema additive migration per playbook §4.3 — corrected field names:
    add account_uuid, state enum, total_minor (NOT total_kes_minor — KP wire
    field is amount_minor), kp_charge_id, itafika_job_id, traceparent,
    business_op_id, rail_audit array. Mandatory Rule.integer().min(0) on every
    *_minor field. Keep legacy text-shaped shippingAddress + rawCapture.
  - 12 unit tests + octopus-api/scripts/smoke-identiti.ts.

WEEK 2 — Kipkiren Pay (the most invasive replacement; webhook is Kafka-only today):
  - Author app/lib/rails/payment-rail/client.ts using shared signRequest().
    Secret encoding: base64url-43 (NOT hex — Identiti is hex but KP/Todoku are
    base64url-43 per KMV guide §1).
  - Author app/lib/rails/payment-rail/money.ts: kesMinorToMajor, kesMajorToMinor,
    formatKes. Integer minor units ONLY. Wire field name is amount_minor
    (NOT amount_kes_minor — KP returns 422 for unrecognised field).
  - Wire (CORRECTED paths per KMV guide §6):
    - POST /v1/charges/initiate (body: account_uuid, amount_minor, currency:"KES",
      purpose, external_ref, idempotency_key)
    - GET /v1/charges/{id}
    - POST /v1/payouts/initiate (NOTE the /initiate suffix — /v1/payouts is the
      trap that 404s; KMV guide §6 calls this out explicitly)
    - GET /v1/payouts/{id}
    - POST /v1/holds (KP-9 escrow)
  - KP webhook = KAFKA-ONLY today (no HTTP signer per KMV guide §6 lines 470-477):
    - PRIMARY: Author app/lib/rails/payment-rail/kafka-consumer.ts using kafkajs
      subscribed to kp.wallet.events / kp.payment.events / kp.payout.events.
      Kafka offset is dedup primitive.
    - SECONDARY (inert today): HAND-WRITE app/lib/rails/payment-rail/webhook.ts
      scaffold (MAIN LOOP only — Money Rule). Will fire ZERO traffic until KP
      ships HTTP signer. PAYMENT_RAIL_WEBHOOK_SECRET env var stays unfilled.
      - Signature verify raw bytes constant-time BEFORE JSON.parse
        (use req.text() in App Router, NOT req.json())
      - Replay window 300s
      - Dedup via Vercel KV (NOT Sanity — see playbook §4.6; serverless race-unsafe)
      - Handle: WALLET_CREDITED, PAYMENT_COMPLETED (patch Sanity → PAID + trigger
        Itafika + trigger Todoku), PAYMENT_FAILED, PAYOUT_COMPLETED, PAYOUT_FAILED
  - Sandbox MSISDN quirk: Daraja sandbox 254708374149 returns ResultCode 1037
    (DS timeout), not success. Smoke needs synthesized callbacks — see KMV §6.
  - Rebuild checkout: app/api/checkout/initiate + status routes (BOTH must declare
    export const runtime = 'nodejs' — Edge runtime can't HMAC-sign), KipkirenPayCheckout.tsx
    component. STK push UX: "Check your phone for the M-Pesa prompt" + 90s countdown
    + retry.
  - octopus-api/scripts/smoke-payment-rail.ts.

WEEK 3 — Todoku (comms):
  - Author app/lib/rails/todoku/client.ts using shared signRequest(). Secret
    encoding base64url-43.
  - Author app/lib/rails/todoku/templates.ts with 8 ULIDs locked as constants:
    unique_accessories_order_confirmed_sms/whatsapp, _shipping_dispatched_sms,
    _delivery_imminent_sms, _delivery_completed_sms, _refund_initiated_sms,
    _cart_abandonment_whatsapp, _restock_notification_whatsapp.
  - POST /v1/messages/send body (CORRECTED — KMV guide §5 explicitly calls these
    "field-name traps"):
    - recipient_token (the Identiti phone_token JWT — NOT phone_token)
    - template_id (ULID constant)
    - template_variables (object — NOT params, NOT variables, NOT vars)
    - channel ("sms" | "whatsapp" | "voice" | "in_app") — required
    - idempotency_key
  - Phone-token minting: ALWAYS via Identiti POST /v1/phone-tokens (audience=todoku),
    NEVER raw MSISDN anywhere.
  - Idempotency-Key: "ua_<order_id>_<event_type>" deterministic per-business-op.
  - Wire sends to KP Kafka events (PAYMENT_COMPLETED → order_confirmed; PAYOUT_COMPLETED
    → refund_initiated) and Itafika webhooks (job.assigned → shipping_dispatched;
    job.delivered → delivery_completed).
  - Template anti-impersonation copy: bake mandatory anti-phishing (class_0 OTP),
    anti-social-engineering (class_1 payment/order), per KMV guide §5 lines 398-404,
    into all 8 template submissions at operator-request time.
  - Sandbox quirk: Todoku sandbox rejects real Identiti sandbox JWTs with
    CHAN_PHONE_TOKEN_INVALID — synthesize SANDBOX_TOKEN_DELIVER_OK_<slug>_<id>
    tokens for Week 3 Day 5 smoke (per KMV §5).
  - octopus-api/scripts/smoke-todoku.ts.

WEEK 4 — Itafika (last-mile delivery; asymmetric HMAC + bodyless-GET gotcha):
  - Author app/lib/rails/itafika/sign.ts (forked from shared signRequest):
    BASE64 outbound HMAC, HEX inbound HMAC. Same canonical otherwise:
    METHOD\nPATH_AND_QUERY\nCONTENT_TYPE\nTIMESTAMP\nSHA256_HEX(rawBody).
    **CRITICAL: bodyless GET signs empty CONTENT_TYPE AND sends no Content-Type
    header. Constant on GET → 401. This bit Identiti — bake it in from day 1.**
  - Author app/lib/rails/itafika/client.ts using the forked sign.ts.
    Secret encoding: hex-64 (per Silvia's IT-S5 handover).
  - Wire (CORRECTED field names — Itafika uses _minor NOT _kes_minor):
    - POST /v1/jobs/quote (returns price_minor / rider_payout_minor /
      move_take_minor — KES integer minor units)
    - POST /v1/jobs (anchor_reference_id = your order_id is the SECOND
      idempotency layer; re-creating with same anchor_reference_id returns
      the existing job, safe-retry without UUID coordination)
    - GET /v1/jobs/{id}
    - POST /v1/jobs/{id}/cancel
  - HAND-WRITE app/lib/rails/itafika/webhook.ts (MAIN LOOP — Money Rule):
    - HEX inbound HMAC: hex(HMAC-SHA256("<timestamp>.<rawBody>", secret))
    - In Next.js App Router: read raw body via req.text(), verify, THEN JSON.parse.
      req.json() parses first — defeats constant-time compare.
    - Replay window 300s
    - Dedupe on (job_id, event) via Vercel KV (NOT Sanity per playbook §4.6)
    - 5 events: job.assigned, job.picked_up, job.delivered, job.failed, job.cancelled
    - On job.delivered: patch Sanity order → DELIVERED + LOG expected delivery
      fee for reconciliation. NOTE: KP-16 charging via Itafika is INERT today —
      Itafika needs (a) your KP account_uuid on the anchor row AND (b) Itafika
      OPS-4 to land. Until then, reconciliation is observe-only.
  - Show delivery fee inline at cart view (via /v1/jobs/quote with shipping geo).
  - octopus-api/scripts/smoke-itafika.ts mirroring the smoke recipe in
    docs/RAIL_INTEGRATION_PLAYBOOK.md §3.4.

WEEK 5 — Phase 1 hardening + Phase 2 scoping:
  - §A.11 audit-log discipline end-to-end: traceparent + business_op_id +
    request_id on every rail_audit row in the Sanity order.
  - RUN AN ADVERSARIAL-VERIFY WORKFLOW against your work (Klokd's pattern caught
    2 critical + 4 major bugs on the cross-cutting playbook before merge; use the
    same pattern here on the 4-rail integration).
  - File OPERATOR_REQUEST_HAKKEN.md (Phase 2 plugin design) + OPERATOR_REQUEST_HELPAN.md
    (Phase 2 agent design) to Silvia.
  - Author RECAP.md mirroring Klokd's v1.2 structure (sprints table, deployment
    state, cross-rail joint status, hard blockers).
  - Deploy to Vercel production. Watch first 5 orders end-to-end.

HARD RULES (from playbook §8):
- No emojis · No Co-Authored-By: Claude trailer · KES integer minor units only.
- No PayPal anywhere after Week 1 (zero env vars, zero deps, zero code).
- No Daraja direct (KP only). No Africa's Talking / Twilio / WhatsApp direct
  (Todoku only). No raw MSISDN / ID images / biometrics anywhere outside Identiti.
- Money Rule: KP webhook.ts + Itafika webhook.ts + delivery-fee reconciliation +
  refund flow = MAIN LOOP ONLY. Sub-agents OK for outbound clients + types/envelopes.
- §A.11: traceparent + business_op_id on every audit row. order_id (KP), shipment_id
  (Itafika), customer_account_uuid (Identiti).
- AD-K06: payment rail base URLs from env vars only. Never hardcoded. Phase 3
  LipaStack flip = env-var-only change.
- For Phase 2 Hakken design: §10.7 banned-key wall (amount/currency/funds/etc reject
  at 422) and PII wall (no MSISDN/email/two-word names) apply. Approved alternative:
  price_range_kes: [50, 5000] integer minor units array.
- For Phase 2 Hakken design: Identiti customer JWT MUST carry aud=hakken
  (in addition to your app's aud). Mint a second JWT or extend audience claim.
- Confirm scope before significant changes. Treat "proceed" as full authorization.

PRE-FLIGHT (run before opening source):
- npm install clean; npm run build clean (PayPal-included baseline);
  npm run lint clean.
- git status: 9 modified + 14+ untracked files exist as of 23 Jun (recap.md,
  README.md, .env.example, package.json with @paypal/react-paypal-js, etc.).
  BEFORE branching: commit the April-2026 PayPal-completion changes to master
  as a baseline + tag pre-rail-integration. Then branch feat/rail-integration-phase-1.
- curl rail /v1/health endpoints — expect 3/4 not 4/4:
  - Identiti: https://identiti-production.up.railway.app/v1/health → 200
    (Railway URL; api.identiti.co.ke not yet cut over)
  - KP: NOT DEPLOYED (pay.kipkiren.co.ke does not exist; KP-1-Ops outstanding
    per master RECAP §8 item 10) — skip this check
  - Todoku: https://todoku-prod-production.up.railway.app/v1/health → 200
  - Itafika: https://itafika-production.up.railway.app/v1/health → 200
- Read RAIL_INTEGRATION_PLAYBOOK.md + KMV_RAILS_INTEGRATION_GUIDE.md (mirror
  locally on Day 1) + master RECAP §1.3 + §5 + §8 end-to-end.
- Confirm operator request bundle sent to Silvia covering — NOTE per-rail
  secret-encoding spec (otherwise Silvia delivers wrong format):
  - Identiti: unique_accessories_sandbox tenant + HMAC secret (hex-64) + JWT
    issuance with aud=unique_accessories (and aud=hakken design for Phase 2 —
    this is a PHASE-1 DESIGN-TIME BLOCK per master RECAP §8 item 3, not
    Phase-2-only)
  - KP: corporate account_uuid (tier_3, gated on CHAMIA-ENTITY) +
    PAYMENT_RAIL_APP_SECRET (base64url-43 — NOT hex like Identiti). NOTE: KP
    webhook is Kafka-only today; PAYMENT_RAIL_WEBHOOK_SECRET cannot be filled
    until KP ships HTTP signer.
  - Todoku: unique_accessories tenant + 8 template ULIDs + TODOKU_APP_SECRET
    (base64url-43) + sender ID UAKE (2-4 week CA-K regulatory lead — file in
    Week 1 Day 1, NOT Week 3)
  - Itafika: unique_accessories anchor + ITAFIKA_APP_SECRET (hex-64) +
    operator records UA's KP account_uuid on the anchor row (otherwise
    KP-16 delivery-fee charging is inert)
- Confirm Day-0 hard gates SIGNED (block Week 1 kickoff if any unsigned):
  - CHAMIA-CURRENCY: Sanity product baseline KES or USD or unmarked?
  - CHAMIA-SANITY-DATASET: canonical 'sanityyy' (code default) or 'production'
    (.env.example default)?
  - CHAMIA-LOGISTICS: confirm Itafika is the last-mile choice
  - CHAMIA-ENTITY: legal entity formalisation (needed for KP tier_3)
  - CHAMIA-AUTH: anonymous express checkout vs. account-required
  - CHAMIA-DATASET-CLEANUP: drop legacy PayPal test orders or tag as legacy?
- Itafika OPS-6 Railway billing does NOT block your dev work against
  currently-deployed dev image. Note for production cutover only.

HARD BLOCKERS (playbook §9 — mirrors master RECAP §8 priority order):
1. 3 stale Identiti integrator HMAC secrets at operator (14-20 days as of 23 Jun) —
   platform-wide critical block. Your unique_accessories_sandbox is 4th in line.
   File the operator request in Week 1 Day 1, not Week 4 Day 1.
2. Itafika OPS-6 Railway billing — does NOT block dev work; blocks rail-side
   redeploy / production cutover.
3. Identiti customer-JWT issuance for aud=hakken — PHASE-1 DESIGN-TIME BLOCK
   (NOT Phase-2-only). Determines whether multi-audience minting is possible.
   Silvia-side ~30-min spec. File at Day 0.
4. Identiti staging cutover (paste-ready since 15 May, still unpressed).
5. OPS-4 (KP itafika_sandbox) + OPS-5 (Todoku creds 1Password) — gates whether
   Itafika delivery-fee charging is live or inert.
6. CHAMIA-1 (Sabakifresh memo) — indirect; affects Itafika operator queue.
7. Itafika eu-west-2 → eu-west-1 region — functional impact today: none.
   Stage 2 cutover impact: yes.
8. KP corporate account_uuid (tier_3) — gated on CHAMIA-ENTITY decision.
9. KP / Todoku / Itafika per-rail APP_SECRETs — pending out-of-band delivery
   (per-rail encoding specified: Identiti hex-64, KP+Todoku base64url-43,
   Itafika hex-64).
10. Todoku sender-ID UAKE filing — 2-4 week regulatory lead. File Week 1 Day 1.
11. KP-1-Ops Railway deploy — activates UA's payment integration end-to-end.
12. Phase 2 only: HAKKEN_APP_SECRET + unique_accessories_v1 Hakken plugin
    (doesn't exist; file an OPERATOR_REQUEST_HAKKEN.md design ask Week 5).
13. Phase 2 only: HELPAN_API_BASE + HELPAN_APP_SECRET + HELPAN_WEBHOOK_SECRET +
    helpan-unique-accessories-v1 agent (doesn't exist; design ask Week 5).
14. Day-0 hard gates per playbook §0.5 (CHAMIA-CURRENCY / SANITY-DATASET /
    LOGISTICS / ENTITY / AUTH / DATASET-CLEANUP) — block Week 1 kickoff if unsigned.

Confirm scope before significant changes. Treat "proceed" as full authorization.
```
