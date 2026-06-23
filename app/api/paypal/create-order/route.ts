import { NextResponse } from "next/server";
import { createOrder, type PayPalOrderItem } from "@/app/lib/paypal";

interface CartItemPayload {
    name?: unknown;
    quantity?: unknown;
    price?: unknown;
    currency?: unknown;
}

function parseItems(raw: unknown, fallbackCurrency: string): PayPalOrderItem[] {
    if (!Array.isArray(raw)) return [];
    const items: PayPalOrderItem[] = [];
    for (const entry of raw as CartItemPayload[]) {
        const name = typeof entry.name === "string" ? entry.name : null;
        const quantity = typeof entry.quantity === "number" ? entry.quantity : null;
        const price = typeof entry.price === "number" ? entry.price : null;
        const currency = typeof entry.currency === "string" ? entry.currency : fallbackCurrency;
        if (!name || !quantity || price === null || quantity < 1 || price < 0) continue;
        items.push({
            name,
            quantity,
            unitAmount: price,
            currency,
        });
    }
    return items;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const currency = typeof body?.currency === "string" ? body.currency : "USD";
        const items = parseItems(body?.items, currency);
        if (items.length === 0) {
            return NextResponse.json({ error: "Cart is empty or invalid" }, { status: 400 });
        }
        const order = await createOrder(items, currency);
        return NextResponse.json({ id: order.id });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[paypal/create-order]", message);
        return NextResponse.json({ error: "Failed to create PayPal order" }, { status: 500 });
    }
}
