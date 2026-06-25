// Helpan inbound-webhook CORE (functional core / imperative shell). Pure dedup + revoke orchestration
// over injected I/O, so the claim/release-on-failure logic is unit-testable; the shell (handlers.ts)
// wires the real dedup store + revocation store. Mirrors payment-rail/itafika handlers-core.

import { dedupKey } from "../_shared/dedup";
import { HELPAN_WEBHOOK_EVENTS, type HelpanWebhookEvent } from "./types";

export interface HelpanWebhookDeps {
  seenBefore: (key: string) => Promise<boolean>;
  releaseDedup: (key: string) => Promise<void>;
  revokeAuthority: (jti: string) => Promise<void>;
}

/**
 * Today the only event is AUTHORITY_REVOKED, which marks a delegated-authority token (by jti) revoked
 * so subsequent dispatches reject it (§4, ≤5s). Dedup on (event, jti); the claim is released on
 * failure so a redelivery can recover (claim-then-crash safety).
 */
export async function processHelpanWebhookEvent(event: HelpanWebhookEvent, deps: HelpanWebhookDeps): Promise<void> {
  if (!HELPAN_WEBHOOK_EVENTS.has(event.event as string)) {
    console.warn(`[helpan] unknown event '${event.event}'; acking`);
    return;
  }

  if (event.event === "AUTHORITY_REVOKED") {
    if (!event.jti) {
      console.warn("[helpan] AUTHORITY_REVOKED with no jti; acking");
      return;
    }
    const key = dedupKey("helpan", "AUTHORITY_REVOKED", event.jti);
    if (await deps.seenBefore(key)) return;
    try {
      await deps.revokeAuthority(event.jti);
    } catch (err) {
      if (key) await deps.releaseDedup(key); // claim-then-crash recovery — a redelivery re-revokes
      throw err;
    }
  }
}
