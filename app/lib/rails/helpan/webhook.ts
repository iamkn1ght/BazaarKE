import "server-only";
import { NextResponse } from "next/server";
import { buildCanonical, verifyBase64Signature } from "../_shared/signRequest";
import { dispatchHelpanWebhookEvent } from "./handlers";
import type { HelpanWebhookEvent } from "./types";

/**
 * Helpan inbound webhook receiver (AUTHORITY_REVOKED) — INERT until HELPAN_WEBHOOK_SECRET lands.
 *
 * Base64 inbound HMAC over the shared 5-line canonical (mirrors the KP receiver). Raw bytes BEFORE
 * JSON.parse; constant-time verify; 300s replay window. Returns 503 until the secret is configured —
 * it can never act on an unverified payload.
 */

const REPLAY_WINDOW_MS = 300_000;
const WEBHOOK_PATH = "/api/webhooks/helpan";

export async function handleHelpanWebhook(req: Request): Promise<Response> {
  const secret = process.env.HELPAN_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Helpan not configured (HELPAN_WEBHOOK_SECRET unset)" }, { status: 503 });
  }

  const rawBody = await req.text(); // raw bytes BEFORE JSON.parse
  const signature = req.headers.get("x-helpan-signature");
  const timestamp = req.headers.get("x-helpan-timestamp");
  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing Helpan signature headers" }, { status: 400 });
  }

  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    return NextResponse.json({ error: "Stale or invalid timestamp" }, { status: 401 });
  }

  const canonical = buildCanonical("POST", WEBHOOK_PATH, "application/json; charset=utf-8", timestamp, rawBody);
  if (!verifyBase64Signature(canonical, secret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: HelpanWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!event.event) {
    return NextResponse.json({ error: "Missing event in signed body" }, { status: 400 });
  }

  await dispatchHelpanWebhookEvent(event);
  return NextResponse.json({ received: true });
}
