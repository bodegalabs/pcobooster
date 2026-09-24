import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

import { cloudflare } from "@cloudflare/vite-plugin";
import { getPresentationCacheScope } from "@pcobooster/presentation-mode";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { z } from "zod";

import { resolvePeoplePageAvailability } from "./src/people-page-availability";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

// `alchemy dev`/`deploy` inject their own resource-aware Cloudflare plugin with the Worker's bindings.
const alchemyInjected = process.env.ALCHEMY_CLOUDFLARE_VITE_INJECTED === "1";

/** `bun run dev` serves the marketing site on this port; see `scripts/cloudflare/dev.ts`. */
const marketingDevOrigin = "http://127.0.0.1:3002";

const runBunScript = async (args: readonly string[]): Promise<void> => {
  const child = spawn("bun", args, { cwd: repositoryRoot, stdio: "inherit" });
  const [code] = z
    .tuple([z.number().nullable(), z.string().nullable()])
    .parse(await once(child, "exit"));
  if (code !== 0) {
    throw new Error(`\`bun ${args.join(" ")}\` exited with ${String(code)}`);
  }
};

/**
 * `/` and `/about` serve the prerendered marketing site from `public/marketing`, which Vite
 * copies into the uploaded client assets. Turborepo builds marketing before a standalone
 * product build; Alchemy has no pre-build hook, so its builds run the marketing build first.
 */
const stageMarketingSite = (): Plugin => ({
  name: "pcobooster:stage-marketing",
  apply: "build",
  buildApp: {
    order: "pre",
    handler: async () => {
      if (alchemyInjected) {
        await runBunScript(["run", "build:marketing"]);
      }
      await runBunScript(["run", "scripts/stage-marketing.ts"]);
    },
  },
});

/** Public values inlined into both the server and browser bundles. */
const publicDefines = (devServer: boolean) => ({
  // The API reads the same Infisical keys at runtime.
  "import.meta.env.VITE_POSTHOG_KEY": JSON.stringify(
    process.env.POSTHOG_PROJECT_KEY ?? ""
  ),
  "import.meta.env.VITE_PLANNING_CENTER_TIME_ZONE": JSON.stringify(
    process.env.PLANNING_CENTER_TIME_ZONE ?? ""
  ),
  // `bun run dev:present` sets presentation mode for the dev server; deployed builds are
  // always live.
  "import.meta.env.VITE_PEOPLE_PAGE_ENABLED": JSON.stringify(
    resolvePeoplePageAvailability(process.env.PEOPLE_PAGE_ENABLED, devServer)
  ),
  "import.meta.env.VITE_PRESENTATION_SCOPE": JSON.stringify(
    devServer ? getPresentationCacheScope() : "live"
  ),
});

export default defineConfig(({ command, isPreview }) => {
  const devServer = command === "serve" && isPreview !== true;
  return {
    define: publicDefines(devServer),
    resolve: { tsconfigPaths: true },
    server: {
      // Next.js used dev rewrites for these; the marketing dev server owns them locally.
      proxy: {
        "^/(?:about/?)?(?:\\?.*)?$": marketingDevOrigin,
        "^/marketing/": marketingDevOrigin,
      },
    },
    plugins: [
      stageMarketingSite(),
      tailwindcss(),
      alchemyInjected
        ? null
        : cloudflare({
            viteEnvironment: { name: "ssr" },
            // Standalone builds (CI, `vite preview`) only; Alchemy owns the deployed Worker config.
            config: {
              name: "pcobooster-web",
              main: "@tanstack/react-start/server-entry",
              compatibility_date: "2026-09-01",
              compatibility_flags: ["nodejs_compat"],
              assets: { binding: "ASSETS" },
              vars: { PRODUCT_ORIGIN: "http://127.0.0.1:3001" },
            },
          }),
      tanstackStart(),
      // Must follow tanstackStart().
      viteReact(),
    ],
  };
});
