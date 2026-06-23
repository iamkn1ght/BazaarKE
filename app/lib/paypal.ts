import "server-only";

const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

function getCredentials() {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !secret) {
        throw new Error("PayPal credentials missing: set NEXT_PUBLIC_PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
    }
    return { clientId, secret };
}

async function getAccessToken(): Promise<string> {
    const { clientId, secret } = getCredentials();
    const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
    const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
}

export interface PayPalOrderItem {
    name: string;
    quantity: number;
    unitAmount: number;
    currency: string;
}

export async function createOrder(items: PayPalOrderItem[], currency: string) {
    if (items.length === 0) throw new Error("Cannot create PayPal order with empty cart");

    const token = await getAccessToken();

    const itemTotal = items.reduce((sum, i) => sum + i.unitAmount * i.quantity, 0);

    const payload = {
        intent: "CAPTURE",
        purchase_units: [
            {
                amount: {
                    currency_code: currency,
                    value: itemTotal.toFixed(2),
                    breakdown: {
                        item_total: {
                            currency_code: currency,
                            value: itemTotal.toFixed(2),
                        },
                    },
                },
                items: items.map((i) => ({
                    name: i.name.slice(0, 127),
                    quantity: String(i.quantity),
                    unit_amount: {
                        currency_code: i.currency,
                        value: i.unitAmount.toFixed(2),
                    },
                })),
            },
        ],
    };

    const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
    });

    if (!res.ok) {
        throw new Error(`PayPal create order failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as { id: string; status: string };
}

export async function captureOrder(orderId: string) {
    const token = await getAccessToken();
    const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(`PayPal capture failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
}

export interface WebhookHeaders {
    authAlgo: string;
    certUrl: string;
    transmissionId: string;
    transmissionSig: string;
    transmissionTime: string;
}

export async function verifyWebhookSignature(
    headers: WebhookHeaders,
    rawBody: string,
): Promise<boolean> {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
        throw new Error("PAYPAL_WEBHOOK_ID is not set");
    }
    const token = await getAccessToken();
    const res = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            auth_algo: headers.authAlgo,
            cert_url: headers.certUrl,
            transmission_id: headers.transmissionId,
            transmission_sig: headers.transmissionSig,
            transmission_time: headers.transmissionTime,
            webhook_id: webhookId,
            webhook_event: JSON.parse(rawBody),
        }),
        cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { verification_status?: string };
    return data.verification_status === "SUCCESS";
}
