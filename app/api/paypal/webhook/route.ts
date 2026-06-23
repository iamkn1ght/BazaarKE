import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/app/lib/paypal";
import { getWriteClient } from "@/app/lib/sanity-write";

interface PayPalWebhookEvent {
    event_type: string;
    resource?: {
        id?: string;
        supplementary_data?: {
            related_ids?: {
                order_id?: string;
            };
        };
    };
}

function statusForEvent(eventType: string): string | null {
    switch (eventType) {
        case "PAYMENT.CAPTURE.COMPLETED":
            return "COMPLETED";
        case "PAYMENT.CAPTURE.REFUNDED":
            return "REFUNDED";
        case "PAYMENT.CAPTURE.DENIED":
            return "FAILED";
        case "CUSTOMER.DISPUTE.CREATED":
        case "CUSTOMER.DISPUTE.UPDATED":
            return "DISPUTED";
        default:
            return null;
    }
}

export async function POST(req: Request) {
    const rawBody = await req.text();

    const authAlgo = req.headers.get("paypal-auth-algo");
    const certUrl = req.headers.get("paypal-cert-url");
    const transmissionId = req.headers.get("paypal-transmission-id");
    const transmissionSig = req.headers.get("paypal-transmission-sig");
    const transmissionTime = req.headers.get("paypal-transmission-time");

    if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
        return NextResponse.json({ error: "Missing PayPal signature headers" }, { status: 400 });
    }

    try {
        const ok = await verifyWebhookSignature(
            { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime },
            rawBody,
        );
        if (!ok) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }
    } catch (err) {
        console.error("[paypal/webhook] verification error:", err);
        return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }

    let event: PayPalWebhookEvent;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const newStatus = statusForEvent(event.event_type);
    const orderId = event.resource?.supplementary_data?.related_ids?.order_id ?? event.resource?.id;

    if (newStatus && orderId) {
        try {
            const client = getWriteClient();
            await client
                .patch(`order.${orderId}`)
                .set({ status: newStatus })
                .commit({ autoGenerateArrayKeys: true });
        } catch (err) {
            console.error("[paypal/webhook] order patch failed:", err);
        }
    }

    return NextResponse.json({ received: true });
}
