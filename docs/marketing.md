# PCOBooster marketing site

The public site is a separate Next.js app at `apps/marketing`. The existing product remains at the repository root. Bun workspaces provide one lockfile and independent app dependencies; shared product packages can be extracted later.

## Development

- `bun run dev`: product on port 3000 and marketing on port 3001.
- `bun run dev:present`: both apps, with anonymized Planning Center people in the product.
- `bun run dev:marketing`: marketing only, with no database, Infisical, OAuth, or session requirement.
- `bun run dev:app`: product only. Start marketing separately to use `/` or `/about`.

Use port 3000 to test the whole journey, including Open app. In development, the product rewrites `/`, `/about`, and `/marketing/*` to port 3001. Marketing uses full document navigation so it never asks the product router to load a marketing page (or vice versa).

Marketing uses the supported webpack compiler. With the product still at the repository root, the installed Turbopack version picked up the ancestor product proxy when compiling the nested app. Revisit this once both apps have sibling workspace directories. Marketing styling is isolated in a CSS module; it does not import product UI, authentication, or providers.

## Build and deployment

Run `bun run build` from the repository root. It:

1. Builds `apps/marketing` as a static Next.js export.
2. Stages the export into the ignored, generated `public/marketing` directory.
3. Builds the product, including those public assets.

The existing Vercel project can continue using the repository root, with install command `bun install --frozen-lockfile` and build command **`bun run build`**. Do not override that with `next build`: the marketing export must be staged first. No second deployment, production origin variable, or OAuth callback change is required. Product secrets remain needed only by the product build/runtime.

Production rewrites `/` and `/about` to the exported HTML. Marketing assets use `/marketing`, avoiding collisions with the product's `/_next` chunks. Those exact public routes bypass the product auth proxy; `/services`, `/people`, `/admin`, and product APIs retain their existing authentication behavior.

`bun run verify` checks both apps' types, shared lint/formatting, and the complete test suite. The public-path tests cover the marketing allowlist and near-miss routes.

## Content and screenshots

The working product strategy informed the positioning, but its proposed prices, seats, future features, and older naming are not commitments. Public copy uses PCOBooster and pcobooster.com. Solo and Team prices are TBD, with no checkout or fabricated waitlist submission.

The screenshots in `apps/marketing/public/marketing/screenshots` are captures of the actual Assign, Lineup, and nearby-schedule interfaces. People were anonymized with local presentation mode. Organization labels were replaced in the browser, fictional-name disambiguation suffixes were removed for readability, and account/developer controls were hidden before capture. No assignments were changed. The page identifies the screenshots as anonymized. Review all visible text and avatars when replacing them; presentation mode alone does not mask every organization or plan label.

The site reuses the product’s rocket logo (`public/logo.svg`) and Inter typography, without decorative eyebrow labels. It states that PCOBooster is not affiliated with, sponsored by, or endorsed by Planning Center. References: [Planning Center developers](https://www.planningcenter.com/developers) and [branding guidelines](https://www.planningcenter.com/logos). This is compatibility wording, not a claim of directory listing or official partner status.
