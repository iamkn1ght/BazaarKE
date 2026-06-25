import "server-only";
import { releaseDedup, seenBefore } from "../_shared/dedup";
import { revokeAuthority } from "./revocation";
import { processHelpanWebhookEvent } from "./handlers-core";
import type { HelpanWebhookEvent } from "./types";

/**
 * Helpan inbound webhook SHELL — wires the real dedup + revocation stores into the pure core
 * (handlers-core.ts). webhook.ts imports this. INERT until HELPAN_WEBHOOK_SECRET lands.
 */
export async function dispatchHelpanWebhookEvent(event: HelpanWebhookEvent): Promise<void> {
  return processHelpanWebhookEvent(event, { seenBefore, releaseDedup, revokeAuthority });
}
