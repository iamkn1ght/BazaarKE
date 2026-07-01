import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Sanity image CDN (product/hero images).
    remotePatterns: [{ protocol: "https", hostname: "cdn.sanity.io" }],
  },
};

export default nextConfig;
