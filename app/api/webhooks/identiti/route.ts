import { NextResponse } from "next/server";
import { buildCanonical, verifyBase64Signature } from "@/app/lib/rails/_shared/signRequest";

/**
 * Identiti webhook receiver — INERT until ID-14 Phase 2.
 *
 * Identiti emits to Kafka (identiti.kyc.events / identiti.account.events) today and ships no
 * outbound HTTP webhook signer until ID-14; there is therefore no IDENTITI_WEBHOOK_SECRET yet.
 * This handler is built now (per playbook §3.1) but stays inert: with no secret configured it
 * refuses to process, so it can never act on an unverified payload. When the secret lands, it
 * verifies the base64 HMAC over the raw bytes BEFORE JSON.parse, then routes the three real
 * Identiti events. (Identiti has no Money Rule — safe to extend without the main-loop constraint.)
 *
 * Subscribed events (the only three Identiti emits): KYC_TIER_CHANGED, SIM_SWAP_DETECTED,
 * ACCOUNT_DEACTIVATED. PHONE_CHANGED and ACCOUNT_SUSPENDED are NOT Identiti events.
 */

export const runtime = "nodejs"; // crypto.createHmac is Node-only; Edge would silently fail

type IdentitiEvent = "KYC_TIER_CHANGED" | "SIM_SWAP_DETECTED" | "ACCOUNT_DEACTIVATED";

interface IdentitiWebhookBody {
  event_type?: string;
  account_uuid?: string;
  data?: Record<string, unknown>;
}

const REPLAY_WINDOW_MS = 300_000;

export async function POST(req: Request) {
  const secret = process.env.IDENTITI_WEBHOOK_SECRET;
  if (!secret) {
    // Inert: Identiti is Kafka-only today (ID-14 Phase 2 ships the HTTP signer).
    return NextResponse.json(
      { error: "Identiti HTTP webhooks not yet enabled (Kafka-only until ID-14)" },
      { status: 503 },
    );
  }

  // Raw bytes BEFORE JSON.parse — req.json() would parse first and defeat the constant-time verify.
  const rawBody = await req.text();
  const signature = req.headers.get("x-identiti-signature");
  const timestamp = req.headers.get("x-identiti-timestamp");
  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing Identiti signature headers" }, { status: 400 });
  }

  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    return NextResponse.json({ error: "Stale or invalid timestamp" }, { status: 401 });
  }

  // Inbound canonical for Identiti (base64 rail). Exact header/canonical shape is confirmed at ID-14.
  const canonical = buildCanonical("POST", "/api/webhooks/identiti", "application/json; charset=utf-8", timestamp, rawBody);
  if (!verifyBase64Signature(canonical, secret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: IdentitiWebhookBody;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  switch (event.event_type as IdentitiEvent | undefined) {
    case "KYC_TIER_CHANGED":
      // TODO(ID-14): invalidate cached tier for event.account_uuid (60s TTL cache).
      break;
    case "SIM_SWAP_DETECTED":
      // TODO(ID-14): re-mint phone token + force re-auth for event.account_uuid (security-critical).
      break;
    case "ACCOUNT_DEACTIVATED":
      // TODO(ID-14): mark the local customer record deactivated; block new orders.
      break;
    default:
      // Unknown/unsubscribed event — ack so Identiti doesn't retry.
      break;
  }

  return NextResponse.json({ received: true });
}
