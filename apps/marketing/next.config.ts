import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  assetPrefix: "/marketing",
  images: { unoptimized: true },

  devIndicators: false,
};

export default nextConfig;
