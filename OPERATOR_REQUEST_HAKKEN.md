# Operator Request — Hakken (Phase 2, design ask)

**To:** Silvia Mumbua (CTO · Kipkiren Teknolojia · Hakken rail operator)
**From:** Unique Accessories engineering · Chamia Mutuku (CEO · KMV) · authored 24 June 2026
**Authority:** `docs/RAIL_INTEGRATION_PLAYBOOK.md` §3.5 + §10.7 · `C:\Projects\Klokd\docs\HAKKEN_INTEGRATION_REFERENCE.md` (canonical wire) · master RECAP §8 item 3
**Status:** 🟠 DESIGN ASK (operator side) — no `unique_accessories_v1` Hakken plugin exists; nothing ships this phase. **UA-side scaffold is now BUILT and INERT** (`app/lib/rails/hakken/*`): the §10.7 banned-key + PII walls are enforced app-side (fail-closed, any nesting depth), `price_range_kes` banding replaces raw prices, the three-header pilot auth is isolated from the 4-rail signer, vertical isolation is filtered app-side, and `getHakkenJwt` defers until `aud=hakken` lands. Doubly inert (HAKKEN_* unset + no aud=hakken JWT). 25 unit tests.
**Estimated operator effort:** plugin scaffold + secret issuance (~half day) + the shared `aud=hakken` JWT design (~30 min, RECAP §8 item 3 — also blocks Klokd + Lunch Drop).
**External lead time:** DPA-2019 counsel sign-off is a Hakken-pilot precondition (platform-wide, not UA-specific).

---

## 0. Why design-time now (not Phase-2-only)

The one Hakken dependency that is **Phase-1 design-time**, not Phase-2: the Identiti customer JWT must be mintable with `aud=hakken` (in addition to UA's own `aud=unique_accessories`). UA's Identiti client (`app/lib/rails/identiti/client.ts`) issues `aud=unique_accessories` today; Hakken calls 401 with `AUTH_JWT_AUDIENCE` otherwise. This is master RECAP §8 item 3 and is already raised in `OPERATOR_REQUEST_IDENTITI.md` §4a — restating here so the two requests cross-reference. Decide: multi-audience in one mint vs. a second per-audience mint.

## 1. The ask

| Field | Value |
|---|---|
| app_slug | `unique_accessories` |
| plugin | `unique_accessories_v1` (does not exist — please scaffold) |
| vertical | e-commerce / retail (physical goods) |
| audience_posture | `general_consumer` |
| entities | product listings (cross-app discovery surface) |
| pilot scope | discovery of UA catalog within the consumer ZoneFeed |

## 2. Env vars (Phase 2)

| Env var | Value | Notes |
|---|---|---|
| `HAKKEN_API_BASE` | `https://hakken-production.up.railway.app` | Railway prod (per playbook §2.3). |
| `HAKKEN_APP_KEY` | `unique_accessories` | = app_slug. |
| `HAKKEN_APP_SECRET` | `<TBC encoding>` | ⚠ Encoding **TBC** per the Hakken plugin design — specify hex-64 vs base64url-43 at issuance so the loader validates correctly. Deliver via 1Password. |

## 3. Auth

Interim **three-header pilot auth** during the Hakken pilot (per `HAKKEN_INTEGRATION_REFERENCE.md`), idempotency-required. A dedicated `app/lib/rails/hakken/threeHeaderAuth.ts` (separate from the shared 4-rail signer) — do NOT fold Hakken into `_shared/signRequest.ts`.

## 4. Endpoints (Phase 2)

- `POST /v1/entities` — register UA product entities (geo no finer than **neighbourhood** precision; exact addresses are never registered).
- `POST /v1/broadcasts` — requires `consent_scope` + `ttl_at` (ISO-8601, **≤ now + 168h**).
- `POST /v1/ranking/query` — discovery ranking.

## 5. ⚠ Regulatory containment — the two walls UA will encode from day 1

- **§10.7 banned-key wall:** keys like `amount` / `currency` / `funds` / `price` / `balance` (and anything money-shaped) are rejected at **422 `REGULATORY_CONTAINMENT_VIOLATION`** at ANY nesting depth. UA must NOT send raw prices to Hakken. **Approved alternative:** `price_range_kes: [50, 5000]` — an integer **KES minor units** array (a band, not an exact price).
- **PII wall:** no MSISDN, no email, no two-word capitalised personal names in any Hakken payload. Entities are product-shaped, not person-shaped.

## 6. Vertical isolation

Hakken enforces isolation at schema/API/ranking layers; a UA broadcast must never surface in another app's ZoneFeed. Bleed is **P0** (`VERTICAL_BLEED_DETECTED`). UA's app layer will ALSO enforce isolation (never render wrong-vertical results) and show empty-results-with-retry on a paused query.

## 7. App-side commitments (informational)

| Item | Owner | Status |
|---|---|---|
| Hakken client isolated from the 4-rail signer (`hakken/threeHeaderAuth.ts`) | UA eng | ✅ built — separate `threeHeaderAuth.ts`, never folded into `_shared/signRequest.ts` |
| Banned-key + PII guards (incl. `source_payment` carve-out + capitalised-name pattern) | UA eng | ✅ built — `hakken/containment.ts`, fail-closed at any depth; runs before every send |
| `price_range_kes` integer minor-units band instead of raw price | UA eng | ✅ built — `priceRangeKes()` band; builders never emit a raw `price` |
| `getHakkenJwt` deferral pattern (503 → `audit_log.action='hakken.deferred.*'`) until `aud=hakken` lands | UA eng | ✅ built — `hakken/jwt.ts` throws `HakkenDeferredError("<op>")` (op-tagged for the audit row) |

**To go live (operator):** scaffold the `unique_accessories_v1` plugin; set `HAKKEN_API_BASE` + `HAKKEN_APP_SECRET` (confirm encoding); ship Identiti multi-audience minting so `getHakkenJwt` can return an `aud=hakken` JWT (then wire it in `hakken/jwt.ts`). UA app-side walls are already enforced.

## 8. Cross-reference

- `docs/RAIL_INTEGRATION_PLAYBOOK.md` §3.5, §10.7 · `C:\Projects\Klokd\docs\HAKKEN_INTEGRATION_REFERENCE.md` · `OPERATOR_REQUEST_IDENTITI.md` §4a (aud=hakken) · master RECAP §8 item 3.

*Operator Request — Hakken (Phase 2 design) · 24 June 2026 · Confidential · Depends-on: OPERATOR_REQUEST_IDENTITI.md (aud=hakken JWT)*
