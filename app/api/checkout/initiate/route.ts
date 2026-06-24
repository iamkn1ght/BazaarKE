import { NextResponse } from "next/server";
import { client } from "@/app/lib/sanity";
import { getWriteClient } from "@/app/lib/sanity-write";
import { getSession, setSession } from "@/app/lib/auth/session";
import { createCustomer, issueCustomerToken } from "@/app/lib/rails/identiti";
import { initiateCharge } from "@/app/lib/rails/payment-rail/client";
import { coerceDestination } from "@/app/lib/rails/itafika/geo";
import { newTraceparent } from "@/app/lib/rails/_shared/trace";
import { RailError } from "@/app/lib/rails/_shared/railFetch";

// HMAC signing is Node-only; Edge would silently fail.
export const runtime = "nodejs";

const E164 = /^\+\d{7,15}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QTY_PER_LINE = 1000;

interface CartLine {
  id: string;
  quantity: number;
}

interface PriceRow {
  _id: string;
  name?: string;
  price_minor?: number;
  price?: number;
}

interface ExistingOrder {
  account_uuid?: string;
  kp_charge_id?: string;
  total_minor?: number;
  traceparent?: string;
  shipping_destination?: { lat: number; lng: number; label: string };
}

function parseLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: CartLine[] = [];
  for (const entry of raw) {
    const id = typeof entry?.id === "string" ? entry.id : null;
    const quantity = typeof entry?.quantity === "number" ? entry.quantity : null;
    if (!id || !quantity || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) continue;
    lines.push({ id, quantity });
  }
  return lines;
}

/** Authoritative price = Sanity price_minor (fall back to legacy price*100). Never trust client amounts. */
function priceMinorOf(row: PriceRow): number {
  if (typeof row.price_minor === "number" && Number.isInteger(row.price_minor)) return row.price_minor;
  if (typeof row.price === "number") return Math.round(row.price * 100);
  return 0;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // A stable per-checkout-attempt id (client-minted, resent unchanged on retry) makes the order
    // doc, the KP idempotency_key, and the customer-create idempotent across retries — so a retried
    // Pay click returns the SAME order/charge instead of double-creating and double-charging.
    const attemptId = typeof body?.checkout_attempt_id === "string" ? body.checkout_attempt_id : "";
    if (!UUID.test(attemptId)) {
      return NextResponse.json({ error: "Missing or invalid checkout_attempt_id" }, { status: 400 });
    }
    const externalRef = `ua_order_${attemptId}`;
    const orderDocId = `order.${externalRef}`;

    const lines = parseLines(body?.items);
    if (lines.length === 0) {
      return NextResponse.json({ error: "Cart is empty or invalid" }, { status: 400 });
    }

    // Geocoded delivery point — required so a paid order can be dispatched to Itafika. The label is
    // the rider-readable address; lat/lng come from the device GPS pin (or a pasted map pin).
    const shippingDestination = coerceDestination(body?.shipping_destination);
    if (!shippingDestination) {
      return NextResponse.json(
        { error: "Add a delivery location in Kenya (pin your address) before paying." },
        { status: 400 },
      );
    }

    const writeClient = getWriteClient();
    const existing = (await writeClient.getDocument(orderDocId)) as ExistingOrder | undefined;

    // Idempotent short-circuit: this attempt already has a charge — return it, don't push again.
    if (existing?.kp_charge_id) {
      return NextResponse.json({
        charge_id: existing.kp_charge_id,
        external_ref: externalRef,
        total_minor: existing.total_minor ?? 0,
        status: "PENDING",
      });
    }

    const traceparent = existing?.traceparent ?? newTraceparent();

    // 1) Resolve the buyer's Identiti account_uuid (reuse on retry; anonymous-express creates one).
    const session = await getSession();
    let accountUuid = existing?.account_uuid ?? session?.account_uuid ?? null;
    if (!accountUuid) {
      const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      if (!E164.test(phone) || !name) {
        return NextResponse.json(
          { error: "Guest checkout needs an M-Pesa phone (E.164, e.g. +254700000000) and a name." },
          { status: 400 },
        );
      }
      const [first, ...rest] = name.split(/\s+/);
      // Stable idempotency + app_correlation per attempt so a retry returns the SAME customer.
      const customer = await createCustomer(
        {
          phone,
          name_first: first,
          name_last: rest.join(" ") || first,
          app_correlation: `unique_accessories_${attemptId}`,
          consent: {
            dpa_consent: true,
            kyc_consent: true,
            marketing_consent: false,
            captured_at: new Date().toISOString(),
            captured_via: "app_onboarding",
          },
        },
        { traceparent, idempotencyKey: `customer_${attemptId}` },
      );
      accountUuid = customer.account_uuid;
      const token = await issueCustomerToken(accountUuid, { traceparent, idempotencyKey: `token_${attemptId}` });
      await setSession({ account_uuid: accountUuid, token: token.token }, token.expires_in);
    }

    // 2) Recompute the total from Sanity (authoritative) — never trust client-supplied prices.
    const ids = lines.map((l) => l.id);
    const rows = await client.fetch<PriceRow[]>(
      `*[_type == "product" && _id in $ids]{ _id, name, price_minor, price }`,
      { ids },
    );
    const byId = new Map(rows.map((r) => [r._id, r]));
    let totalMinor = 0;
    const items: Array<{ name: string; quantity: number; unit_price_minor: number }> = [];
    for (const line of lines) {
      const row = byId.get(line.id);
      if (!row) return NextResponse.json({ error: `Unknown product: ${line.id}` }, { status: 400 });
      const unit = priceMinorOf(row);
      if (unit <= 0) {
        return NextResponse.json({ error: `Product ${row.name ?? line.id} is not priced for checkout` }, { status: 409 });
      }
      totalMinor += unit * line.quantity;
      items.push({ name: row.name ?? line.id, quantity: line.quantity, unit_price_minor: unit });
    }
    if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
      return NextResponse.json({ error: "Order total is out of range" }, { status: 400 });
    }

    // 3) Create the order (PENDING) keyed by the stable external_ref, then initiate the KP charge.
    await writeClient.createIfNotExists({
      _id: orderDocId,
      _type: "order",
      state: "PENDING",
      account_uuid: accountUuid,
      currency: "KES",
      total_minor: totalMinor,
      business_op_id: attemptId,
      traceparent,
      shipping_destination: shippingDestination,
      items,
    });

    // If the order pre-existed (a retry before any charge — we already short-circuited once charged),
    // persist the latest pre-charge address so an edited delivery point isn't silently dropped. Only
    // write when it actually changed, and do NOT swallow the error: this runs before the charge, so
    // failing the request closed (the client retries the same attempt) is the safe outcome.
    const prev = existing?.shipping_destination;
    const addressChanged =
      !!existing &&
      (!prev ||
        prev.lat !== shippingDestination.lat ||
        prev.lng !== shippingDestination.lng ||
        prev.label !== shippingDestination.label);
    if (addressChanged) {
      await writeClient.patch(orderDocId).set({ shipping_destination: shippingDestination }).commit();
    }

    let charge;
    let requestId: string | undefined;
    try {
      const result = await initiateCharge(
        {
          account_uuid: accountUuid,
          amount_minor: totalMinor,
          currency: "KES",
          purpose: "order_purchase",
          external_ref: externalRef,
          idempotency_key: attemptId,
        },
        { traceparent, idempotencyKey: attemptId },
      );
      charge = result.charge;
      requestId = result.requestId;
    } catch (chargeErr) {
      // Don't leave an orphan PENDING order: mark it FAILED with an audit row, then surface the error.
      await writeClient
        .patch(orderDocId)
        .setIfMissing({ rail_audit: [] })
        .set({ state: "FAILED" })
        .append("rail_audit", [
          {
            rail: "kipkiren_pay",
            action: "charge.initiate",
            traceparent,
            business_op_id: attemptId,
            timestamp: new Date().toISOString(),
            success: false,
            error_code: chargeErr instanceof RailError ? chargeErr.code : "CHARGE_FAILED",
          },
        ])
        .commit({ autoGenerateArrayKeys: true })
        .catch(() => {});
      throw chargeErr;
    }

    await writeClient
      .patch(orderDocId)
      .setIfMissing({ rail_audit: [] })
      .set({ kp_charge_id: charge.charge_id })
      .append("rail_audit", [
        {
          rail: "kipkiren_pay",
          action: "charge.initiate",
          traceparent,
          business_op_id: attemptId,
          request_id: requestId,
          timestamp: new Date().toISOString(),
          success: true,
        },
      ])
      .commit({ autoGenerateArrayKeys: true });

    return NextResponse.json({
      charge_id: charge.charge_id,
      external_ref: externalRef,
      total_minor: totalMinor,
      status: charge.status,
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("RAIL_CONFIG_INCOMPLETE")) {
      return NextResponse.json({ error: "Payment is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }
    if (err instanceof RailError) {
      console.error("[checkout/initiate] rail error:", err.rail, err.code, err.message);
      return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
    }
    console.error("[checkout/initiate]", err);
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }
}
