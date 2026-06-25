import "server-only";
import { railFetch, type RailClientConfig } from "../_shared/railFetch";
import type { DispatchToHelpanInput, DispatchToHelpanResult } from "./types";

/**
 * Helpan AI client (server-only) — UA as a CONSUMER, dispatching actions TO Helpan via the shared
 * HMAC signer (prefix "Helpan", base64 outbound). Phase 2: HELPAN_* are unset today, so getConfig()
 * throws RAIL_CONFIG_INCOMPLETE and callers degrade rather than crash.
 */

function getConfig(): RailClientConfig {
  const baseUrl = process.env.HELPAN_API_BASE;
  const appId = process.env.HELPAN_APP_ID ?? "unique_accessories";
  const secret = process.env.HELPAN_APP_SECRET;
  if (!baseUrl || !secret) {
    throw new Error("RAIL_CONFIG_INCOMPLETE: helpan (need HELPAN_API_BASE, HELPAN_APP_SECRET) — Phase 2, not provisioned yet");
  }
  // Secret ENCODING is "confirmed at issuance" (OPERATOR_REQUEST_HELPAN.md §2). We deliberately do
  // NOT guess base64url-43 vs hex-64 here — a wrong encoding guard would either reject a valid secret
  // or pass a wrong one into silent 401s. Validate the encoding once Silvia confirms it.
  return { prefix: "Helpan", baseUrl: baseUrl.replace(/\/+$/, ""), appId, secret };
}

export interface CallContext {
  traceparent?: string;
}

/** POST /v1/actions/dispatch — dispatch an action to a Helpan agent. */
export async function dispatchToHelpan(input: DispatchToHelpanInput, ctx: CallContext = {}): Promise<DispatchToHelpanResult> {
  const { data } = await railFetch<DispatchToHelpanResult>(getConfig(), {
    method: "POST",
    path: "/v1/actions/dispatch",
    body: input,
    idempotencyKey: input.idempotency_key,
    traceparent: ctx.traceparent,
  });
  return data;
}

/** True only when ALL Helpan secrets are present — the gate for being a live dispatch target. */
export function helpanConfigured(): boolean {
  return Boolean(process.env.HELPAN_API_BASE && process.env.HELPAN_APP_SECRET && process.env.HELPAN_WEBHOOK_SECRET);
}
