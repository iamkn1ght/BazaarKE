import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "./components/Navbar";
import Providers from "./components/Providers";
import ShoppingCartModal from "./components/ShoppingCartModal";
import Footer from "./components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "BazaarKE",
    template: "%s | BazaarKE",
  },
  description: "Hand-picked electronics, kitchenware, furniture and accessories. Pay with M-Pesa, delivered across Kenya.",
  openGraph: {
    title: "BazaarKE",
    description: "Hand-picked electronics, kitchenware, furniture and accessories. Pay with M-Pesa, delivered across Kenya.",
    url: siteUrl,
    siteName: "BazaarKE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BazaarKE",
    description: "Hand-picked electronics, kitchenware, furniture and accessories. Pay with M-Pesa, delivered across Kenya.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <div className="bg-neutral-900 text-center text-white">
            <p className="py-2 text-xs font-medium tracking-wide">Pay with M-Pesa. Delivered across Kenya.</p>
          </div>
          <Navbar />
          <ShoppingCartModal />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
