import "server-only";
import { NextResponse } from "next/server";
import { buildCanonical, verifyBase64Signature } from "../_shared/signRequest";
import { dispatchKpEvent } from "./handlers";
import type { KpEvent } from "./types";

/**
 * KP HTTP webhook receiver — INERT today. Money Rule: main-loop only.
 *
 * KP emits to Kafka only (kp.wallet.events / kp.payment.events / kp.payout.events) and ships no
 * HTTP webhook signer yet, so PAYMENT_RAIL_WEBHOOK_SECRET is unset and this handler returns 503
 * (it can never act on an unverified payload). The PRIMARY path is kafka-consumer.ts. When KP
 * ships the HTTP signer, fill the secret and this activates with no further code changes.
 *
 * Verification order matters: raw bytes -> constant-time HMAC verify -> JSON.parse. Reading
 * req.text() (NOT req.json()) keeps the exact bytes for the signature compare.
 */

const REPLAY_WINDOW_MS = 300_000;
const WEBHOOK_PATH = "/api/webhooks/payment-rail";

export async function handleKpWebhook(req: Request): Promise<Response> {
  const secret = process.env.PAYMENT_RAIL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "KP HTTP webhooks not enabled (Kafka-only; no HTTP signer yet)" },
      { status: 503 },
    );
  }

  const rawBody = await req.text(); // raw bytes BEFORE JSON.parse
  const signature = req.headers.get("x-kp-signature");
  const timestamp = req.headers.get("x-kp-timestamp");
  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing KP signature headers" }, { status: 400 });
  }

  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    return NextResponse.json({ error: "Stale or invalid timestamp" }, { status: 401 });
  }

  const canonical = buildCanonical("POST", WEBHOOK_PATH, "application/json; charset=utf-8", timestamp, rawBody);
  if (!verifyBase64Signature(canonical, secret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: KpEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await dispatchKpEvent(event);
  return NextResponse.json({ received: true });
}
