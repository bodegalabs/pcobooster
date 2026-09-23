import { defineConfig } from "vitest/config";

const rootDir = import.meta.dirname;

export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/server/src/**/*.test.ts",
      "apps/web/src/**/*.test.ts",
      "apps/admin/src/**/*.test.ts",
      "lint/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    environment: "node",
    globals: true,
    clearMocks: true,
    // Unit tests must not inherit database or OAuth credentials from .env.local.
    env: {
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET:
        "pcobooster-unit-test-secret-with-no-production-access",
      PLANNING_CENTER_OAUTH_CLIENT_ID: "test-client",
      PLANNING_CENTER_OAUTH_CLIENT_SECRET: "test-client-secret",
      PLANNING_CENTER_CLIENT: "test-client",
      PLANNING_CENTER_PAT: "test-token",
      DEV_AUTH_BYPASS: "0",
      PRESENTATION_MODE: "0",
      DEMO_ACCESS_KEY: "",
      DEMO_PLANNING_CENTER_CLIENT: "",
      DEMO_PLANNING_CENTER_PAT: "",
    },
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
      // Use the marker's published server entry without selecting React's RSC runtime.
      {
        find: "server-only",
        replacement: `${rootDir}/node_modules/server-only/empty.js`,
      },
    ],
  },
});
