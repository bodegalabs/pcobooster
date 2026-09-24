# pcobooster.com marketing site

The public site is a separate TanStack Start app at `apps/marketing`, prerendered to static HTML at build time. It is a sibling of the product in `apps/web` and the Hono API in `apps/server`; Bun workspaces and Turborepo provide one lockfile and an ordered build graph.

## Development

- `bun run dev`: API on port 3000, product on port 3001, marketing on port 3002, and admin on port 3003.
- `bun run dev:present`: the same, with anonymized Planning Center people in the product.
- `bun run dev:marketing`: marketing only, with no database, Infisical, OAuth, or session requirement.

Use port 3001 to test the whole journey, including Open app. In development, the product forwards `/api/*` to the local API Worker through its service binding and proxies `/`, `/about`, and `/marketing/*` to port 3002. Marketing uses full document navigation so it never asks the product router to load a marketing page (or vice versa).

The marketing dev server is Vite. Its assets are served under `/marketing/` while its pages route at `/` and `/about`; Start rewrites the page requests internally. Vite's HMR websocket may not survive the product's proxy, so open port 3002 directly for hot reload. Styling uses Tailwind and marketing's own shadcn primitives (`src/components/ui`, Base UI, the same `base-luma` style as the product) on the product's design tokens; the interactive replica keeps its CSS modules. Marketing does not import product UI, authentication, or providers.

## Build and deployment

Run `bun run build` from the repository root. It:

1. Builds `apps/marketing` with `vite build`, which prerenders `/` and `/about` to `dist/client/index.html` and `dist/client/about.html` beside their `assets/`.
2. Stages `dist/client` into the ignored, generated `apps/web/public/marketing` directory (`scripts/stage-marketing.ts`).
3. Builds the product.

The product is a TanStack Start app deployed with Alchemy's `Cloudflare.Website.Vite`. Vite copies the staged files into the product's client assets, which Alchemy uploads. Alchemy's build has no pre-build hook, so a plugin in `apps/web/vite.config.ts` runs `bun run build:marketing` first when Alchemy drives the build; standalone builds stage the marketing build Turborepo already ran. The product's `/` and `/about` server routes fetch `/marketing/index.html` and `/marketing/about.html` from the `ASSETS` binding.

Marketing assets use `/marketing` (the Vite `base`), avoiding collisions with the product's `/assets` chunks. Those exact public routes bypass the product's sign-in gate (`apps/web/src/lib/request-gate.ts`); `/services`, `/people`, `/admin`, and product APIs retain their existing authentication behavior. In development the product's Vite server proxies `/`, `/about`, and `/marketing/*` to the marketing dev server on port 3002.

Prerendering runs only at build time. Start serves the pages through `vite preview` while it writes them; `src/server.ts` and a preview middleware in `vite.config.ts` reconcile the `/marketing/` asset base with the `/` page paths there. Nothing marketing-specific runs on a server in production. Titles, descriptions, canonical URLs, and the Open Graph/Twitter card come from `src/lib/site-head.ts`.

`bun run ci` checks both apps' types, shared lint/formatting, and the complete test suite. The public-path tests cover the marketing allowlist and near-miss routes.

## Content and screenshots

The working product strategy informed the positioning, but its proposed prices, seats, future features, and older naming are not commitments. Public copy uses pcobooster.com. Solo and Team prices are TBD, with no checkout or fabricated waitlist submission.

The screenshots in `apps/marketing/public/screenshots` are captures of the actual Assign, Lineup, and nearby-schedule interfaces. People were anonymized with local presentation mode. Organization labels were replaced in the browser, fictional-name disambiguation suffixes were removed for readability, and account/developer controls were hidden before capture. No assignments were changed. The page identifies the screenshots as anonymized. Review all visible text and avatars when replacing them; presentation mode alone does not mask every organization or plan label.

The site reuses the product’s rocket logo and Inter typography, without decorative eyebrow labels. Decorative SVG motion lives in `src/components/graphics`: it animates only `transform` and `opacity`, pauses offscreen (`LoopWhenVisible`), stops under `prefers-reduced-motion`, and every graphic's resting frame is complete, so prerendered HTML reads the same without JavaScript. Scroll reveals use CSS scroll-driven animations and leave content visible where unsupported. It states that pcobooster.com is not affiliated with, sponsored by, or endorsed by Planning Center. References: [Planning Center developers](https://www.planningcenter.com/developers) and [branding guidelines](https://www.planningcenter.com/logos). This is compatibility wording, not a claim of directory listing or official partner status.
