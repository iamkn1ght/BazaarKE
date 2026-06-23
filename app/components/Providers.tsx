"use client";

import { ReactNode } from "react";
import { CartProvider as USCProvider } from "use-shopping-cart";
import { PayPalScriptProvider } from "@paypal/react-paypal-js";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

export default function Providers({ children }: { children: ReactNode }) {
    return (
        <PayPalScriptProvider
            options={{
                clientId: paypalClientId,
                currency: "USD",
                intent: "capture",
            }}
        >
            <USCProvider
                mode="payment"
                stripe=""
                cartMode="client-only"
                successUrl={`${baseUrl}/success`}
                cancelUrl={`${baseUrl}/cancel`}
                currency="USD"
                billingAddressCollection={false}
                shouldPersist={true}
                language="en-UK"
            >
                {children}
            </USCProvider>
        </PayPalScriptProvider>
    );
}

