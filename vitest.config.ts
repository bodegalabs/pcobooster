import { defineConfig } from "vitest/config";

const rootDir = import.meta.dirname;

export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/server/src/**/*.test.ts",
      "apps/web/src/**/*.test.ts",
      "apps/admin/src/**/*.test.ts",
      "apps/marketing/src/**/*.test.ts",
      "lint/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    environment: "node",
    globals: true,
    clearMocks: true,
  },
  resolve: {
    alias: [
      {
        find: "cloudflare:workers",
        replacement: `${rootDir}/scripts/testing/cloudflare-workers.ts`,
      },
      {
        find: "@",
        replacement: `${rootDir}/apps/web/src`,
      },
    ],
  },
});
