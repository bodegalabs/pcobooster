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
    : [];

const nextConfig: NextConfig = {
  transpilePackages: ["@pcobooster/analytics"],
  turbopack: { root: workspaceRoot },
  rewrites: async () =>
    await Promise.resolve({
      beforeFiles:
        process.env.NODE_ENV === "development"
          ? [
              { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
              {
                source: "/admin/:path*",
                destination: "http://127.0.0.1:3003/admin/:path*",
              },
              ...marketingRewrites,
            ]
          : [],
      afterFiles: [],
      fallback: [],
    }),
};

export default nextConfig;
