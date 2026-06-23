import { NextResponse } from "next/server";
import { captureOrder } from "@/app/lib/paypal";
import { getWriteClient } from "@/app/lib/sanity-write";

interface PayPalCaptureResponse {
    id: string;
    status: string;
    payer?: {
        name?: { given_name?: string; surname?: string };
        email_address?: string;
    };
    purchase_units?: Array<{
        items?: Array<{
            name?: string;
            quantity?: string;
            unit_amount?: { value?: string; currency_code?: string };
        }>;
        shipping?: {
            name?: { full_name?: string };
            address?: {
                address_line_1?: string;
                address_line_2?: string;
                admin_area_2?: string;
                admin_area_1?: string;
                postal_code?: string;
                country_code?: string;
            };
        };
        payments?: {
            captures?: Array<{
                amount?: { value?: string; currency_code?: string };
                create_time?: string;
            }>;
        };
    }>;
}

function summarizeOrder(capture: PayPalCaptureResponse) {
    const unit = capture.purchase_units?.[0];
    const firstCapture = unit?.payments?.captures?.[0];
    const amount = firstCapture?.amount;
    const payer = capture.payer;
    const address = unit?.shipping?.address;
    const shippingLines = address
        ? [
              unit?.shipping?.name?.full_name,
              address.address_line_1,
              address.address_line_2,
              [address.admin_area_2, address.admin_area_1, address.postal_code].filter(Boolean).join(", "),
              address.country_code,
          ].filter(Boolean)
        : [];

    return {
        status: capture.status,
        currency: amount?.currency_code ?? "USD",
        total: amount?.value ? Number(amount.value) : 0,
        items: (unit?.items ?? []).map((i) => ({
            _key: `${i.name ?? "item"}-${i.quantity ?? "0"}`,
            name: i.name ?? "",
            quantity: i.quantity ? Number(i.quantity) : 0,
            unitPrice: i.unit_amount?.value ? Number(i.unit_amount.value) : 0,
        })),
        payerEmail: payer?.email_address,
        payerName: [payer?.name?.given_name, payer?.name?.surname].filter(Boolean).join(" "),
        shippingAddress: shippingLines.join("\n"),
        capturedAt: firstCapture?.create_time ?? new Date().toISOString(),
    };
}

async function persistOrder(capture: PayPalCaptureResponse) {
    const summary = summarizeOrder(capture);
    const client = getWriteClient();
    await client.createOrReplace({
        _id: `order.${capture.id}`,
        _type: "order",
        paypalOrderId: capture.id,
        ...summary,
        rawCapture: JSON.stringify(capture, null, 2),
    });
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const orderId = typeof body?.orderID === "string" ? body.orderID : null;
        if (!orderId) {
            return NextResponse.json({ error: "Missing orderID" }, { status: 400 });
        }

        const result = (await captureOrder(orderId)) as PayPalCaptureResponse;

        try {
            await persistOrder(result);
        } catch (persistErr) {
            console.error("[paypal/capture-order] persist failed:", persistErr);
        }

        return NextResponse.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[paypal/capture-order]", message);
        return NextResponse.json({ error: "Failed to capture PayPal order" }, { status: 500 });
    }
}
