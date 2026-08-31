import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  output: process.env.CAPACITOR_BUILD === "1" ? "export" : undefined,
  images: process.env.CAPACITOR_BUILD === "1" ? { unoptimized: true } : undefined,
};

export default nextConfig;
