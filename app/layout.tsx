import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "./components/Navbar";
import Providers from "./components/Providers";
import ShoppingCartModal from "./components/ShoppingCartModal";

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
    default: "Unique Accessories",
    template: "%s — Unique Accessories",
  },
  description: "Hand-picked electronics, kitchenware, furniture and accessories.",
  openGraph: {
    title: "Unique Accessories",
    description: "Hand-picked electronics, kitchenware, furniture and accessories.",
    url: siteUrl,
    siteName: "Unique Accessories",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Unique Accessories",
    description: "Hand-picked electronics, kitchenware, furniture and accessories.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <Navbar />
          <ShoppingCartModal />
          {children}
        </Providers>
      </body>
    </html>
  );
}
