import path from "node:path";

import type { NextConfig } from "next";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");

const nextConfig: NextConfig = {
  basePath:
    process.env.ADMIN_BASE_PATH ??
    (process.env.NODE_ENV === "development" ? "/admin" : ""),
  turbopack: { root: workspaceRoot },
  devIndicators: false,
  headers: async () =>
    await Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ]),
};

export default nextConfig;
