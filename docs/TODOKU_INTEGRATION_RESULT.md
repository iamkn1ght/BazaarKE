# Todoku Integration — Result (Week 3)

**Branch:** `feat/rail-integration-phase-1` · **Date:** 24 June 2026
**Verification:** `npm run lint` ✓ · `npx tsc --noEmit` ✓ · `npm run test` ✓ (26/26) · `npm run build` ✓

Adds order/refund comms via the Todoku rail (SMS/WhatsApp), wired to the KP payment events. No Money Rule (comms) — but raw MSISDNs never appear (Cardinal Rule).

---

## Done

- `app/lib/rails/todoku/types.ts` — send envelope with the field-name traps documented (`recipient_token` not `phone_token`, `template_id` ULID not slug, `template_variables` not params/vars, `channel` required).
- `app/lib/rails/todoku/templates.ts` — the **8 `unique_accessories_*` templates** keyed semantically, each ULID read from `TODOKU_TPL_*` env with a `PENDING_OPERATOR_ULID` sentinel; `templateId()` throws `TEMPLATE_NOT_READY` rather than send against a placeholder (matches the env-loader contract in `OPERATOR_REQUEST_TODOKU.md`). Mandatory anti-impersonation copy lives in the template body, submitted at operator-request time.
- `app/lib/rails/todoku/client.ts` — `sendMessage` (`POST /v1/messages/send`) + `getMessage` via the shared signer (prefix `Todoku`, secret validated **base64url-43**). No `X-Todoku-Tenant` header.
- `app/lib/rails/todoku/notify.ts` — `notifyAccount`: mints a **fresh Identiti phone token (audience=todoku)** per send (never cached), or a synthesized `SANDBOX_TOKEN_DELIVER_OK_*` token when `TODOKU_SANDBOX_TOKENS=true` (Todoku sandbox rejects real Identiti JWTs with `CHAN_PHONE_TOKEN_INVALID`).
- `app/lib/rails/todoku/keys.ts` — `notifyIdempotencyKey` → deterministic `ua_<order_id>_<event_type>`.
- **Wired into KP handlers** (`payment-rail/handlers.ts`): `PAYMENT_COMPLETED` → `order_confirmed_sms` + `order_confirmed_whatsapp`; `PAYOUT_COMPLETED` → `refund_initiated_sms`. Each send is wrapped so a comms failure **does not** roll back the payment state (partial-failure rule, App Integration Guide §8.6) and is inert until creds/ULIDs land (`RAIL_CONFIG_INCOMPLETE`/`TEMPLATE_NOT_READY` caught + logged).
- `scripts/smoke-todoku.ts` (`npm run smoke:todoku`) — send → poll using a synthesized sandbox token.
- 3 unit tests (registry shape + channels + slug namespacing, `TEMPLATE_NOT_READY` guard, idempotency-key format). Suite now 26.

---

## Blocked / deferred

| Item | Status |
|---|---|
| Todoku tenant + 8 template ULIDs + `TODOKU_APP_SECRET` (base64url-43) | Pending Silvia (OPERATOR_REQUEST_TODOKU.md) — `templateId` throws until `TODOKU_TPL_*` are set. |
| Sender ID `UAKE` | 2-4 week CA-K regulatory lead (filed Week 1). |
| `shipping_dispatched` / `delivery_imminent` / `delivery_completed` sends | Triggered by Itafika webhooks — **Week 4**. |
| `cart_abandonment_whatsapp` / `restock_notification_whatsapp` | Need a cron worker + wishlist/cart-idle tracking — deferred (not in the Week-3 wire scope). |
| Full-chain smoke (Identiti JWT → Todoku) | Needs both rails' sandbox creds; use the synth token until then. |

---

## Notes
- Phone tokens are minted fresh per send and never cached (15-min freshness window).
- Two sends on PAYMENT_COMPLETED (sms + whatsapp) use distinct idempotency keys so neither dedups the other at Todoku.
