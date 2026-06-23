import "server-only";
import { NextResponse } from "next/server";
import { verifyItafikaInbound } from "./sign";
import { dispatchItafikaEvent } from "./handlers";
import type { ItafikaWebhookEvent } from "./types";

/**
 * Itafika webhook receiver — Money Rule: main-loop only.
 *
 * Inbound HEX HMAC over "<timestamp>.<rawBody>" with the SAME ITAFIKA_APP_SECRET (no separate
 * webhook secret). Raw bytes BEFORE JSON.parse; constant-time verify; 300s replay window. Dedup
 * on (job_id, event) happens inside dispatchItafikaEvent (Vercel KV). Returns 503 until the secret
 * is configured. Live once Silvia registers the callback URL on the unique_accessories anchor.
 */

export const REPLAY_WINDOW_MS = 300_000;

export async function handleItafikaWebhook(req: Request): Promise<Response> {
  const secret = process.env.ITAFIKA_APP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Itafika not configured (ITAFIKA_APP_SECRET unset)" }, { status: 503 });
  }

  const rawBody = await req.text(); // raw bytes BEFORE JSON.parse
  const signature = req.headers.get("x-itafika-signature");
  const timestamp = req.headers.get("x-itafika-timestamp");
  const eventHeader = req.headers.get("x-itafika-event");
  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing Itafika signature headers" }, { status: 400 });
  }

  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    return NextResponse.json({ error: "Stale or invalid timestamp" }, { status: 401 });
  }

  if (!verifyItafikaInbound(timestamp, rawBody, secret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: ItafikaWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!event.event && eventHeader) event.event = eventHeader;

  await dispatchItafikaEvent(event);
  return NextResponse.json({ received: true });
}
