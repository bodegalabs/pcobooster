import path from "node:path";

import type { NextConfig } from "next";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const apiOrigin = "http://127.0.0.1:3000";
const marketingOrigin = "http://127.0.0.1:3002";
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
  transpilePackages: ["@worship-admin/api"],
  turbopack: { root: workspaceRoot },
  rewrites: async () =>
    await Promise.resolve([
      ...(process.env.NODE_ENV === "development"
        ? [
            {
              source: "/api/:path*",
              destination: `${apiOrigin}/api/:path*`,
            },
          ]
        : []),
      ...marketingRewrites,
    ]),
};

export default nextConfig;
