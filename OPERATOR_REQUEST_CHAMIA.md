# Operator Request — Chamia (Day-0 Hard Gates)

**To:** Chamia Mutuku (CEO · KMV) — product/business authority for Unique Accessories
**From:** Unique Accessories engineering · authored 23 June 2026
**Authority:** `docs/RAIL_INTEGRATION_PLAYBOOK.md` §0.5 (Day-0 hard gates) · `STARTUP_RAIL_INTEGRATION.md` pre-flight
**Status:** 🟢 RESOLVED — 5 of 6 gates signed 23 June 2026; **CHAMIA-ENTITY** answered in principle, registration **date** still outstanding (does not block Week 1 code; blocks KP `tier_3` provisioning + production cutover).
**Estimated decision effort:** none remaining except confirming the entity registration date.

---

## 0. Purpose

Playbook §0.5 names six Day-0 hard gates that **branch the Week 1 schema-migration / build plan** and therefore must be answered *before* Week 1 code begins. Reconnaissance on 23 June 2026 confirmed none were recorded as signed anywhere in the repo or the master cross-rail RECAP (the six gate IDs did not appear in `…\Platform Rails…\RECAP.md`; only `CHAMIA-ITAFIKA`, `CHAMIA-REGION`, and `CHAMIA-1` exist there, none of which are these). This file records the signed answers so Week 1 is unblocked and the decisions are auditable.

Two of the gates resolve pre-existing **code-level conflicts** found during recon (dataset default mismatch; absence of a currency field), not merely policy choices.

---

## 1. Gate decisions (signed 23 June 2026)

| Gate | Question | Decision | Downstream impact |
|---|---|---|---|
| **CHAMIA-SANITY-DATASET** | Canonical dataset `sanityyy` (code default) or `production` (`.env.example` default)? | **`sanityyy`** is canonical. Fix `.env.example` (`production` → `sanityyy`) so a fresh `.env` copy hits the right dataset. | Frozen before any schema migration; prevents "zero products found / integration looks broken". |
| **CHAMIA-CURRENCY** | Is `product.price` KES, USD, or unmarked? FX rate if USD? | **Unmarked placeholder numbers.** Re-price the catalog **directly in KES minor units** (no FX migration). The Sanity `product` schema has **no currency field**; the `$` in the UI is cosmetic; there are no real customers. | Week 1 Day 4 migration writes `price_minor` from a deliberate KES re-price, **not** `price*100` or `price*fx*100`. |
| **CHAMIA-AUTH** | Anonymous express checkout vs. account-required? | **Anonymous express checkout + post-purchase account upsell** (playbook's recommended posture). Creates a tier-0 Identiti account on the fly; offers signup after purchase. | Shapes Week 1 Day 2-3 auth flow; `app/login` + `app/signup` exist but checkout never forces them. |
| **CHAMIA-DATASET-CLEANUP** | Drop legacy PayPal `order` docs or tag them? | **Tag** with `legacy: 'paypal'` (do not drop) — auditable, reversible. | Week 1 Day 4 cleanup pass tags rather than deletes. |
| **CHAMIA-LOGISTICS** | Confirm Itafika is the last-mile choice? | **Confirmed — Itafika.** Week 4 Itafika build fires (not parked). | `OPERATOR_REQUEST_ITAFIKA.md` filed Week 1 Day 1; Week 4 work proceeds. |
| **CHAMIA-ENTITY** | When is "Unique Accessories Ltd" formalised? | **Entity name confirmed = "Unique Accessories Ltd"; registration date TBD.** | KP corporate `tier_3` account is gated on registration; production cutover (Week 5) slips if not registered. Does **not** block Week 1 code. |

---

## 2. Decision detail / rationale

### CHAMIA-SANITY-DATASET → `sanityyy`
`app/lib/sanity.ts` falls back to `sanityyy`; `.env.example` defaults `NEXT_PUBLIC_SANITY_DATASET=production`. These disagree. The code default (and the project's working dataset, per the integration memory `reference_sanity.md`: project `d0fzn4cs`, dataset `sanityyy`) is authoritative. **Action:** `.env.example` updated to `sanityyy` in the PayPal-removal pass. An unauthenticated query to both `sanityyy` and `production` on `d0fzn4cs` returned 404 (dataset is private / needs `SANITY_API_TOKEN`), which is consistent with `sanityyy` being the real, access-controlled dataset.

### CHAMIA-CURRENCY → re-price in KES, no FX
The `product` schema carries only `price: number` — no currency marker — and the storefront has no real customers (per `recap.md`: "largely content population"). Treating the existing numbers as USD-historical and applying an FX migration would bake in a guessed rate. Instead the catalog is **re-priced directly in KES minor units** as a deliberate content action. The migration script (`scripts/migrate-sanity-paypal-to-kp.ts`) therefore does **not** multiply by an FX rate; it sets `price_minor` and (where a sensible KES value isn't yet set) flags the product for manual re-pricing rather than guessing.

### CHAMIA-AUTH → anonymous express + upsell
Lowest checkout friction; matches the playbook recommendation. Identiti tier-0 account is created on the fly at checkout; `app/signup` / `app/login` exist for the post-purchase upsell and returning customers but are never a checkout gate.

### CHAMIA-DATASET-CLEANUP → tag legacy
Any test PayPal `order` documents in the dev/staging dataset are tagged `legacy: 'paypal'` rather than deleted, preserving an audit trail and keeping the change reversible.

---

## 3. Outstanding

- **CHAMIA-ENTITY registration date.** Needed to (a) provision the KP corporate `account_uuid` at `tier_3` (`OPERATOR_REQUEST_KP.md`), and (b) fill the legal-entity line in the KP operator request. Tracked as TBD in `OPERATOR_REQUEST_KP.md`. Production cutover (Week 5) is the hard deadline.

---

## 4. Cross-reference

- `docs/RAIL_INTEGRATION_PLAYBOOK.md` §0.5 (gate definitions), §4.3 (schema migration), §4.5 (no real customers)
- `OPERATOR_REQUEST_IDENTITI.md` / `_KP.md` / `_TODOKU.md` / `_ITAFIKA.md` (rail provisioning; KP gated on CHAMIA-ENTITY)
- `docs/PAYPAL_REMOVAL_RUNBOOK.md` (executes the CHAMIA-SANITY-DATASET fix + CHAMIA-DATASET-CLEANUP tagging)

*Gate record · Chamia Day-0 hard gates · 23 June 2026 · Confidential · 5/6 signed, CHAMIA-ENTITY date outstanding*
