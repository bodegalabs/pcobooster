import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";

import { resolveAdminBase, withMountTrailingSlash } from "./src/lib/base-path";

// `alchemy dev`/`deploy` inject their own resource-aware Cloudflare plugin with the Worker's bindings.
const alchemyInjected = process.env.ALCHEMY_CLOUDFLARE_VITE_INJECTED === "1";

/** Vite's base guard 404s the bare mount path; `src/server.ts` handles it in the Worker. */
const serveBareMountPath = (base: string): Plugin => {
  const middleware: Connect.NextHandleFunction = (request, _response, next) => {
    if (request.url !== undefined) {
      request.url = withMountTrailingSlash(request.url, base);
    }
    next();
  };
  return {
    name: "pcobooster:admin-bare-mount-path",
    configureServer: (server) => {
      server.middlewares.use(middleware);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(middleware);
    },
  };
};

export default defineConfig(({ command, isPreview }) => {
  const base = resolveAdminBase(
    process.env.ADMIN_BASE_PATH,
    command === "serve" && isPreview !== true
  );
  return {
    base,
    resolve: { tsconfigPaths: true },
    plugins: [
      serveBareMountPath(base),
      tailwindcss(),
      alchemyInjected
        ? null
        : cloudflare({
            viteEnvironment: { name: "ssr" },
            // Standalone builds (CI, `vite preview`) only; Alchemy owns the deployed Worker config.
            config: {
              name: "pcobooster-admin",
              main: "./src/server.ts",
              compatibility_date: "2026-09-01",
              compatibility_flags: ["nodejs_compat"],
              vars: { PRODUCT_ORIGIN: "http://127.0.0.1:3001" },
            },
          }),
      tanstackStart(),
      // Must follow tanstackStart().
      viteReact(),
    ],
  };
});
