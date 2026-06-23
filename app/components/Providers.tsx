"use client";

import { ReactNode } from "react";
import { CartProvider as USCProvider } from "use-shopping-cart";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

// PayPal removed (Cardinal Rule: apps never call third-party payment providers directly).
// Payment moves to Kipkiren Pay; the KES checkout component lands in Week 2. The cart is
// KES-denominated here so prices never render with a "$" against KES values.
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <USCProvider
      mode="payment"
      stripe=""
      cartMode="client-only"
      successUrl={`${baseUrl}/success`}
      cancelUrl={`${baseUrl}/cancel`}
      currency="KES"
      billingAddressCollection={false}
      shouldPersist={true}
      language="en-KE"
    >
      {children}
    </USCProvider>
  );
}
