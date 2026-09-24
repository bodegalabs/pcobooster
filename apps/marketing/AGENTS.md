# Marketing site

A TanStack Start app that is built as static files: `vite build` prerenders `/` and `/about` into `dist/client`, and `scripts/stage-marketing.ts` copies that directory into the product's `public/marketing`. See [docs/marketing.md](../../docs/marketing.md).

- Vite `base` is `/marketing/` (asset URLs); the router basepath is `/` (page URLs). Build asset links with `marketingAssetUrl` from `src/lib/site-head.ts`, and put public files directly under `public/`.
- Page metadata comes from `siteHead()`/`pageHead()` in `src/lib/site-head.ts`. Run `bun run build:marketing` and inspect `dist/client/*.html` after changing it.
- Links to the product (`/services`, `/auth`) and between marketing pages are plain `<a>` elements: every navigation loads a full document, so the marketing and product routers never share a page.
- Keep it independent of the product: share only `@pcobooster/design-tokens` and `@pcobooster/analytics`. No server functions, loaders that fetch, or Cloudflare bindings; nothing runs on a server after the build.
- Commit `src/routeTree.gen.ts` after adding or renaming routes (`vite dev` or `vite build` regenerates it).
