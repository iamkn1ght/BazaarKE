import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { client } from "@/app/lib/sanity";
import { getWriteClient } from "@/app/lib/sanity-write";
import { getSession, setSession } from "@/app/lib/auth/session";
import { createCustomer, issueCustomerToken } from "@/app/lib/rails/identiti";
import { initiateCharge } from "@/app/lib/rails/payment-rail/client";
import { newTraceparent } from "@/app/lib/rails/_shared/trace";
import { RailError } from "@/app/lib/rails/_shared/railFetch";

// HMAC signing is Node-only; Edge would silently fail.
export const runtime = "nodejs";

const E164 = /^\+\d{7,15}$/;

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

function parseLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: CartLine[] = [];
  for (const entry of raw) {
    const id = typeof entry?.id === "string" ? entry.id : null;
    const quantity = typeof entry?.quantity === "number" ? entry.quantity : null;
    if (!id || !quantity || !Number.isInteger(quantity) || quantity < 1) continue;
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
  const traceparent = newTraceparent();
  try {
    const body = await req.json().catch(() => ({}));
    const lines = parseLines(body?.items);
    if (lines.length === 0) {
      return NextResponse.json({ error: "Cart is empty or invalid" }, { status: 400 });
    }

    // 1) Resolve the buyer's Identiti account_uuid (anonymous express creates one on the fly).
    const session = await getSession();
    let accountUuid = session?.account_uuid ?? null;
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
      const customer = await createCustomer(
        {
          phone,
          name_first: first,
          name_last: rest.join(" ") || first,
          app_correlation: `unique_accessories_${randomUUID()}`,
          consent: {
            dpa_consent: true,
            kyc_consent: true,
            marketing_consent: false,
            captured_at: new Date().toISOString(),
            captured_via: "app_onboarding",
          },
        },
        { traceparent },
      );
      accountUuid = customer.account_uuid;
      const token = await issueCustomerToken(accountUuid, { traceparent });
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
      if (!row) {
        return NextResponse.json({ error: `Unknown product: ${line.id}` }, { status: 400 });
      }
      const unit = priceMinorOf(row);
      if (unit <= 0) {
        return NextResponse.json({ error: `Product ${row.name ?? line.id} is not priced for checkout` }, { status: 409 });
      }
      totalMinor += unit * line.quantity;
      items.push({ name: row.name ?? line.id, quantity: line.quantity, unit_price_minor: unit });
    }

    // 3) Create the order (state PENDING) keyed by external_ref, then initiate the KP charge.
    const orderId = randomUUID();
    const externalRef = `ua_order_${orderId}`;
    const writeClient = getWriteClient();
    await writeClient.createIfNotExists({
      _id: `order.${externalRef}`,
      _type: "order",
      state: "PENDING",
      account_uuid: accountUuid,
      currency: "KES",
      total_minor: totalMinor,
      business_op_id: orderId,
      traceparent,
      items,
    });

    const charge = await initiateCharge(
      {
        account_uuid: accountUuid,
        amount_minor: totalMinor,
        currency: "KES",
        purpose: "order_purchase",
        external_ref: externalRef,
        idempotency_key: orderId,
      },
      { traceparent, idempotencyKey: orderId },
    );

    // Record the charge id + audit row on the order.
    await writeClient
      .patch(`order.${externalRef}`)
      .setIfMissing({ rail_audit: [] })
      .set({ kp_charge_id: charge.charge_id })
      .append("rail_audit", [
        {
          rail: "kipkiren_pay",
          action: "charge.initiate",
          business_op_id: orderId,
          traceparent,
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
    // KP not deployed yet (RAIL_CONFIG_INCOMPLETE) -> 503; other rail errors -> surface code.
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
