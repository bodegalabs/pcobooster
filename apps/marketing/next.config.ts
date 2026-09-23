import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@pcobooster/analytics"],
  output: "export",
  assetPrefix: "/marketing",
  images: { unoptimized: true },

  devIndicators: false,
};

export default nextConfig;
