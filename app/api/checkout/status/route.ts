import { NextResponse } from "next/server";
import { getCharge } from "@/app/lib/rails/payment-rail/client";
import { RailError } from "@/app/lib/rails/_shared/railFetch";

// HMAC signing is Node-only; Edge would silently fail.
export const runtime = "nodejs";

/**
 * GET /api/checkout/status?charge_id=...  — poll KP charge status for the STK-push UX.
 * Read-only: the durable PAID transition is written by the KP webhook/Kafka consumer, not here.
 */
export async function GET(req: Request) {
  const chargeId = new URL(req.url).searchParams.get("charge_id");
  if (!chargeId) {
    return NextResponse.json({ error: "Missing charge_id" }, { status: 400 });
  }
  try {
    const charge = await getCharge(chargeId);
    return NextResponse.json({ charge_id: charge.charge_id, status: charge.status });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("RAIL_CONFIG_INCOMPLETE")) {
      return NextResponse.json({ error: "Payment is temporarily unavailable." }, { status: 503 });
    }
    if (err instanceof RailError) {
      return NextResponse.json({ error: "Could not fetch payment status." }, { status: 502 });
    }
    console.error("[checkout/status]", err);
    return NextResponse.json({ error: "Status check failed." }, { status: 500 });
  }
}
