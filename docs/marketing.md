# worshipadmin.com marketing site

The public site is a separate Next.js app at `apps/marketing`. It is a sibling of the product in `apps/web` and the Hono API in `apps/server`; Bun workspaces and Turborepo provide one lockfile and an ordered build graph.

## Development

- `bun run dev`: API on port 3000, product on port 3001, and marketing on port 3002.
- `bun run dev:present`: both apps, with anonymized Planning Center people in the product.
- `bun run dev:marketing`: marketing only, with no database, Infisical, OAuth, or session requirement.
- `bun run dev:web`: product only. Start the API and marketing separately for the complete flow.

Use port 3001 to test the whole journey, including Open app. In development, the product rewrites `/api/*` to port 3000 and `/`, `/about`, and `/marketing/*` to port 3002. Marketing uses full document navigation so it never asks the product router to load a marketing page (or vice versa).

Marketing uses the supported webpack compiler. Its styling is isolated in a CSS module; it does not import product UI, authentication, or providers.

## Build and deployment

Run `bun run build` from the repository root. It:

1. Builds `apps/marketing` as a static Next.js export.
2. Stages the export into the ignored, generated `apps/web/public/marketing` directory.
3. Builds the product and Hono service.

`vercel.json` defines the web and Hono services and routes `/api/*` to the backend before the product catch-all. The web service builds through the repository root so Turborepo builds and stages marketing first. Keep the root install/build commands; a direct `next build` would omit the staged marketing export.

Production rewrites `/` and `/about` to the exported HTML. Marketing assets use `/marketing`, avoiding collisions with the product's `/_next` chunks. Those exact public routes bypass the product auth proxy; `/services`, `/people`, `/admin`, and product APIs retain their existing authentication behavior.

`bun run ci` checks both apps' types, shared lint/formatting, and the complete test suite. The public-path tests cover the marketing allowlist and near-miss routes.

## Content and screenshots

The working product strategy informed the positioning, but its proposed prices, seats, future features, and older naming are not commitments. Public copy uses worshipadmin.com. Solo and Team prices are TBD, with no checkout or fabricated waitlist submission.

The screenshots in `apps/marketing/public/marketing/screenshots` are captures of the actual Assign, Lineup, and nearby-schedule interfaces. People were anonymized with local presentation mode. Organization labels were replaced in the browser, fictional-name disambiguation suffixes were removed for readability, and account/developer controls were hidden before capture. No assignments were changed. The page identifies the screenshots as anonymized. Review all visible text and avatars when replacing them; presentation mode alone does not mask every organization or plan label.

The site reuses the product’s rocket logo and Inter typography, without decorative eyebrow labels. It states that worshipadmin.com is not affiliated with, sponsored by, or endorsed by Planning Center. References: [Planning Center developers](https://www.planningcenter.com/developers) and [branding guidelines](https://www.planningcenter.com/logos). This is compatibility wording, not a claim of directory listing or official partner status.
