import type { NextConfig } from "next";

const marketingOrigin = "http://127.0.0.1:3001";
const marketingRewrites =
  process.env.NODE_ENV === "development"
    ? [
        { source: "/", destination: `${marketingOrigin}/` },
        { source: "/about", destination: `${marketingOrigin}/about` },
        {
          source: "/marketing/:path*",
          destination: `${marketingOrigin}/marketing/:path*`,
        },
      ]
    : [
        { source: "/", destination: "/marketing/index.html" },
        { source: "/about", destination: "/marketing/about.html" },
      ];

const nextConfig: NextConfig = {
  turbopack: { root: import.meta.dirname },
  rewrites: async () => await Promise.resolve(marketingRewrites),
};

export default nextConfig;
