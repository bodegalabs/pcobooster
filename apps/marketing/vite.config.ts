import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

import { withPublicBase } from "./src/lib/base-path.ts";
import { MARKETING_BASE } from "./src/lib/site-head.ts";

/** Lets prerendering fetch `/` and `/about` through the preview server's base guard. */
const previewPagesOutsideBase = (): Plugin => ({
  name: "pcobooster:marketing-preview-pages",
  configurePreviewServer: (server) => {
    server.middlewares.use((request, _response, next) => {
      if (request.url !== undefined) {
        request.url = withPublicBase(request.url, MARKETING_BASE);
      }
      next();
    });
  },
});

/**
 * A static site generator: `vite build` prerenders every page into `dist/client`, which
 * `scripts/stage-marketing.ts` copies into the product's `public/marketing`. Assets live under
 * `/marketing/` so they never collide with the product's, while pages route at `/` and `/about`.
 */
export default defineConfig({
  base: MARKETING_BASE,
  define: {
    // The same public ingestion key as the product's.
    "import.meta.env.VITE_POSTHOG_KEY": JSON.stringify(
      process.env.POSTHOG_PROJECT_KEY ?? ""
    ),
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    previewPagesOutsideBase(),
    tanstackStart({
      router: { basepath: "/" },
      prerender: {
        enabled: true,
        // Static routes are discovered from the route tree. Crawling would follow product
        // links such as `/services`, which only exist in the product app.
        crawlLinks: false,
        failOnError: true,
        // `about.html`, not `about/index.html`: the product serves these exact files.
        autoSubfolderIndex: false,
      },
    }),
    // Must follow tanstackStart().
    viteReact(),
  ],
});
