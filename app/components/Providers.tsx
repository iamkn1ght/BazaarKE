"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { CartProvider as USCProvider } from "use-shopping-cart";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

// PayPal removed (Cardinal Rule: apps never call third-party payment providers directly).
// Payment is Kipkiren Pay; the cart is KES-denominated so prices never render "$" against KES.
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
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
    </ThemeProvider>
  );
}
