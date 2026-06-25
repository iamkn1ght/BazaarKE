import { NextResponse } from "next/server";
import { buildCanonical, verifyBase64Signature } from "@/app/lib/rails/_shared/signRequest";
import { dispatchAgentCheckout } from "@/app/lib/rails/helpan/agent-checkout";
import { DISPATCH_CODES, type AgentDispatchAction } from "@/app/lib/rails/helpan/types";

// Dual-role Helpan dispatch TARGET: Helpan POSTs agent actions here (auto-refill). HMAC verify is
// Node-only; Edge would silently fail.
export const runtime = "nodejs";

const REPLAY_WINDOW_MS = 300_000;
const DISPATCH_PATH = "/api/agent/checkout";

/**
 * POST /api/agent/checkout — receive a Helpan agent dispatch and (when fully provisioned) place an
 * agent-initiated checkout. The inbound request is HMAC-signed by Helpan with HELPAN_WEBHOOK_SECRET
 * (shared base64 canonical). INERT until that secret lands: returns the structured
 * TARGET_RAIL_UNCONFIGURED fallback (§6) — never a crash. Even when authenticated, the dispatch core
 * fails CLOSED on the delegated-authority gate until Identiti's JWKS is wired.
 */
export async function POST(req: Request) {
  const secret = process.env.HELPAN_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { status: "failed", code: DISPATCH_CODES.TARGET_RAIL_UNCONFIGURED },
      { status: 503 },
    );
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

  const canonical = buildCanonical("POST", DISPATCH_PATH, "application/json; charset=utf-8", timestamp, rawBody);
  if (!verifyBase64Signature(canonical, secret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let action: AgentDispatchAction;
  try {
    action = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Returns a structured DispatchResult (accepted/rejected/failed); never throws.
  const result = await dispatchAgentCheckout(action);
  return NextResponse.json(result);
}
