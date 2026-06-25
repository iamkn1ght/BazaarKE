# Operator Request — Helpan AI (Phase 2, design ask)

**To:** Silvia Mumbua (CTO · Kipkiren Teknolojia · Helpan AI rail operator)
**From:** Unique Accessories engineering · Chamia Mutuku (CEO · KMV) · authored 24 June 2026
**Authority:** `docs/RAIL_INTEGRATION_PLAYBOOK.md` §3.6 · `App_Integration_Guide_v1_1.md` §5-§9 (agent dispatch, delegated authority, initiated_by) · `Platform_Rails_Reboot_Pack_v1_3.md` (Helpan = 4th core rail)
**Status:** 🟠 DESIGN ASK (operator side) — no `helpan-unique-accessories-v1` agent exists; nothing dispatches this phase. This scopes the agent + credentials + the delegated-authority posture. **UA-side scaffold is now BUILT and INERT** (`app/lib/rails/helpan/*`, `/api/agent/checkout`, `/api/webhooks/helpan`): every path fails CLOSED until the agent is registered, the 3 secrets land, and Identiti's JWKS publishes the delegated-authority key. 38 unit tests (authority/RS256/revocation/dispatch). Mirrors the inert-ahead-of-provisioning pattern used for the Identiti/KP webhooks.
**Estimated operator effort:** agent registry entry + 3-secret handover; gated behind the platform-wide Helpan Stage-0→1 legal sign-off (HA-D-09, regulatory containment).
**External lead time:** Helpan delegated-authority legal sign-off is required at Stage 0 (platform-wide, urgent per Reboot Pack §16.4) — not UA-specific.

---

## 0. What UA wants Helpan for

Agent-driven personalisation and **auto-refill** (e.g. consumables re-order). The agent proposes/executes actions on UA's behalf via the dual-role dispatch target.

## 1. The ask

| Field | Value |
|---|---|
| app_slug | `unique_accessories` |
| agent_id | `helpan-unique-accessories-v1` (does not exist — please register; nothing dispatches without it) |
| audience_posture | `general_consumer` (default) |
| family_friendly | ❌ NOT requested — `family_friendly` is portfolio-locked to `helpan-family-discovery-v1` (H-12) and would need a separate DPA review. UA stays `general_consumer`. |

## 2. Env vars (Phase 2)

| Env var | Value | Notes |
|---|---|---|
| `HELPAN_API_BASE` | `https://helpan-production.up.railway.app` | Railway prod. |
| `HELPAN_APP_SECRET` | `<from Silvia / 1Password>` | Encoding to confirm at issuance. |
| `HELPAN_WEBHOOK_SECRET` | `<from Silvia / 1Password>` | For inbound agent-action webhooks. |

## 3. Dispatch surface

`POST /v1/actions/dispatch` → UA exposes a dual-role target at `app/api/agent/checkout/route.ts` (mirror Klokd commit 73e27d6 — the app is both a Helpan consumer and a dispatch target). `runtime='nodejs'`.

## 4. Delegated authority (the hard rule)

- The agent NEVER acts without a **valid, unexpired, in-scope delegated-authority token** — no bypass, no unscoped fallback (HA-D-05, HA-D-09).
- Authority is a **joint contract**: issued by Helpan AI, **validated by Identiti**. Revocation (`AUTHORITY_REVOKED`) propagates to all relying parties within **5 seconds**; in-flight dispatches already accepted by KP/Todoku complete, but dispatches initiated after revocation are rejected.
- Every agent-initiated KP/Todoku/Identiti call carries `initiated_by: "agent"` + `agent_id` (written to each rail's audit log for cross-rail trail reconstruction).

## 5. Money posture

Auto-refill spends real money via **Kipkiren Pay** — every agent-initiated charge goes through the same `app/lib/rails/payment-rail` client (KES minor units, `amount_minor`), carries `initiated_by:"agent"`, and a payout/refund ≥ KES 10,000 still requires an Identiti step-up. No agent path bypasses the Money Rule.

## 6. App-side commitments (informational)

| Item | Owner | Status |
|---|---|---|
| `helpan-unique-accessories-v1` registered before any dispatch | Silvia | ⏳ Phase 2 |
| Dual-role dispatch target `app/api/agent/checkout/route.ts` | UA eng | ✅ built (inert) — HMAC-verified, returns `TARGET_RAIL_UNCONFIGURED` until secrets land |
| `initiated_by:"agent"` + `agent_id` on all agent-initiated rail calls | UA eng | ✅ built — stamped on the agent order doc + `rail_audit` rows (`order.ts` additive fields) |
| Reject dispatches after `AUTHORITY_REVOKED` (≤5s) | UA eng | ✅ built — `helpan/revocation.ts` (KV) + `/api/webhooks/helpan` AUTHORITY_REVOKED receiver; dispatch checks before executing |
| Unconfigured-dispatcher fallback (env unset → `failed/TARGET_RAIL_UNCONFIGURED`, not a crash) | UA eng | ✅ built — structured fallback, no crash |
| Delegated authority NEVER bypassed (signature + claims, fail-closed) | UA eng | ✅ built — `helpan/authority.ts` + `verify.ts` (RS256 vs Identiti JWKS); inert resolver rejects until JWKS lands |

**To go live (operator):** register `helpan-unique-accessories-v1`; set `HELPAN_API_BASE` + `HELPAN_APP_SECRET` + `HELPAN_WEBHOOK_SECRET`; publish the Helpan delegated-authority key on Identiti's JWKS and wire the resolver in `helpan/agent-checkout.ts` (currently inert → fail-closed); register the `/api/agent/checkout` + `/api/webhooks/helpan` callback URLs.

## 7. Cross-reference

- `docs/RAIL_INTEGRATION_PLAYBOOK.md` §3.6 · `App_Integration_Guide_v1_1.md` §5-§9 · `Platform_Rails_Reboot_Pack_v1_3.md` §18.2 (Helpan Stage gate) · master RECAP §8 (Helpan operator handover).

*Operator Request — Helpan AI (Phase 2 design) · 24 June 2026 · Confidential · Depends-on: OPERATOR_REQUEST_IDENTITI.md + OPERATOR_REQUEST_KP.md*
