"use client";

import { useRouter } from "next/navigation";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { useShoppingCart } from "use-shopping-cart";

export default function CheckoutNow() {
    const router = useRouter();
    const { cartDetails, clearCart, handleCartClick } = useShoppingCart();

    const items = Object.values(cartDetails ?? {}).map((entry) => ({
        name: entry.name,
        quantity: entry.quantity,
        price: entry.price,
        currency: entry.currency,
    }));

    const disabled = items.length === 0;

    return (
        <div className="min-h-[45px]">
            <PayPalButtons
                disabled={disabled}
                style={{ layout: "vertical", label: "pay" }}
                createOrder={async () => {
                    const res = await fetch("/api/paypal/create-order", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ items, currency: "USD" }),
                    });
                    if (!res.ok) {
                        const { error } = await res.json().catch(() => ({ error: "Unable to create order" }));
                        throw new Error(error ?? "Unable to create order");
                    }
                    const { id } = (await res.json()) as { id: string };
                    return id;
                }}
                onApprove={async (data) => {
                    const res = await fetch("/api/paypal/capture-order", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ orderID: data.orderID }),
                    });
                    if (!res.ok) {
                        throw new Error("Capture failed");
                    }
                    clearCart();
                    handleCartClick();
                    router.push("/success");
                }}
                onError={(err) => {
                    console.error("[PayPalButtons]", err);
                }}
            />
        </div>
    );
}
