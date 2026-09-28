import { cloudflare } from "@cloudflare/vite-plugin";
import { readDevPorts } from "@pcobooster/config/dev-ports";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { resolveAdminBase } from "./src/lib/base-path.ts";

// `alchemy dev`/`deploy` inject their own resource-aware Cloudflare plugin with the Worker's bindings.
const alchemyInjected = process.env.ALCHEMY_CLOUDFLARE_VITE_INJECTED === "1";

export default defineConfig(({ command, isPreview }) => {
  const base = resolveAdminBase(
    process.env.ADMIN_BASE_PATH,
    command === "serve" && isPreview !== true
  );
  return {
    base,
    // `alchemy dev` passes the same port; this applies to a standalone `vite dev`.
    server: {
      host: "127.0.0.1",
      port: readDevPorts(process.env).admin,
      strictPort: true,
    },
    resolve: { tsconfigPaths: true },
    plugins: [
      tailwindcss(),
      alchemyInjected
        ? null
        : cloudflare({
            viteEnvironment: { name: "ssr" },
            // Standalone builds (CI, `vite preview`) only; Alchemy owns the deployed Worker config.
            config: {
              name: "pcobooster-admin",
              main: "@tanstack/react-start/server-entry",
              compatibility_date: "2026-09-01",
              compatibility_flags: ["nodejs_compat"],
            },
          }),
      tanstackStart(),
      // Must follow tanstackStart().
      viteReact(),
    ],
  };
});
