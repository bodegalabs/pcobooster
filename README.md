# pcobooster.com

Planning Center tools for worship teams.

## Overview

This app helps teams schedule people into open positions for specific plans by combining:

- service type and plan selection
- needed team positions grouped by team
- people matching for the selected team/position
- availability and recent scheduling history context
- one-click scheduling into Planning Center

The public marketing site lives at `/`, with the origin story at `/about`. The authenticated product starts at `/services`.

This is a Bun/Turborepo monorepo. The product UI lives in `apps/web`, the Bun/Hono API service lives in `apps/server`, server implementation lives in `packages/api`, browser-safe oRPC contracts live in `packages/contracts`, Planning Center models and calendar rules live in `packages/planning-center-models`, and the static marketing site lives in `apps/marketing`. See [marketing development and deployment](docs/marketing.md).

For parallel remote development, see [Codex cloud development](docs/codex-cloud.md).

## Setup

This repo uses Bun for dependency management and scripts. Use `bun.lock` as the only lockfile; do not use npm or commit `package-lock.json`.

Use Node.js 24 (see `.node-version`) and Bun 1.3.9 (pinned in `package.json` and CI).

### 1. Install dependencies

```bash
bun install --frozen-lockfile
```

### 2. Configure local secrets with Infisical

Install the [Infisical CLI](https://infisical.com/docs/cli/usage) and run `infisical login`. This repository's `.infisical.json` links to the PCOBooster Infisical project. Add local values to its **Development** environment at the root path (`/`); [application configuration](docs/environment.md) lists the expected keys. Do not paste secret values into issues, chat, or committed files.

Required local keys:

- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `DATABASE_URL`
- `PLANNING_CENTER_OAUTH_CLIENT_ID`
- `PLANNING_CENTER_OAUTH_CLIENT_SECRET`

For the local Planning Center PAT shortcut, set `DEV_AUTH_BYPASS=1`, `PLANNING_CENTER_CLIENT`, and `PLANNING_CENTER_PAT` **only in Development's `/local` folder**. `bun run dev` and `bun run dev:present` read both `/` and `/local`, but database tools and Vercel secret sync read only `/`. The dev servers bind to `127.0.0.1` so this bypass is not exposed on your LAN. `DEV_AUTH_BYPASS` is ignored when `NODE_ENV=production`, but the PAT must never be copied to production or preview. Use separate database credentials per environment. Presentation mode can be started with a command, so it does not need a stored secret.

The normal Bun commands load Infisical automatically. The CLI injects variables into the command process and does not write an env file. For one-off local commands that need the bypass, use `infisical run --env=dev --path=/ --path=/local -- <command>`. Use only `--path=/` for deployable Development secrets.

For deployments, the one-way flow is Infisical Development/Staging/Production `/` to Vercel Development/Preview/Production respectively. Infisical is the source of truth for every application setting through the [three active Vercel syncs](https://infisical.com/docs/integrations/secret-syncs/vercel). Vercel receives generated copies for builds and runtime; never edit those copies directly. Existing deployments need redeployment to pick up changes. See [environment and secret ownership](docs/neon-infisical-preview.md) for Neon branches, preview limitations, and token rotation.

### 3. Configure Planning Center OAuth callback URL

In your Planning Center OAuth app settings, add:

- Local: `http://localhost:3000/api/auth/callback/planning-center`
- Production: `https://pcobooster.com/api/auth/callback/planning-center`

Production `BETTER_AUTH_URL` is `https://pcobooster.com`, managed in Infisical Production `/` and synced to Vercel. The older domain migration record remains in `docs/` as historical context.

### 4. Run database migrations and seeds

```bash
bun run db:migrate
bun run db:seed
```

### 5. Start the app

```bash
bun run dev
```

Open `http://localhost:3001`. Turborepo starts the Hono API on port 3000, the product on port 3001, and marketing on port 3002. The product proxies `/api/*` to Hono and the public marketing routes to port 3002.

### Present locally

```bash
bun run dev:present
```

This enables `PRESENTATION_MODE=1` for the local dev server. The app shows a "Presentation mode" badge. Your signed-in account and organization stay visible. Planning Center people get consistent fictional names, fictional initials, and no photos across candidates, filled positions, search, and People pages. Blockout reasons/descriptions and selected-plan decline notes are masked on the server. Aliases come from about 9,500 name combinations, so two people rarely share one.

Search matches the fictional names. Its first request loads the People directory; subsequent requests reuse the account-scoped directory cache for five minutes. Browser people caches and React Query caches are isolated from normal mode. `PRESENTATION_SEED` optionally changes the aliases and browser cache namespace.

Stop the server, run `bun run dev`, and reload open tabs to return to normal mode. Do not store `PRESENTATION_MODE` in Infisical if you want the command to control it. The flag is ignored in production and on Vercel. It does not change authentication or grant API access.

This masks person fields for app presentations, not the underlying dataset: IDs, schedules, team/position names, plan titles, and free-form plan-item text remain real. Review those custom labels before a public recording. Actions still write to the real Planning Center account; server logs and external Planning Center pages are outside the masking scope.

### Share a read-only demo

`https://pcobooster.com/demo/<key>` opens the app for someone without a Planning Center login. It reads your Planning Center organization with people's personal details spoofed, and cannot write. See [the demo link guide](docs/demo.md) for setup and revocation.

## API Routes

Product operations are served through the typed oRPC transport at `/api/rpc`; its OpenAPI reference is available at `/api/reference`. Better Auth keeps its protocol-owned `GET/POST /api/auth/*` handler. `/health` is the service liveness endpoint.

## Project Structure

```text
apps/
  web/                       # Next.js product UI
  server/                    # Bun/Hono transport and oRPC entrypoint
  marketing/                 # Static-export Next.js marketing site
packages/
  api/                       # Server-only application, auth, DB, adapters, oRPC
  contracts/                 # Browser-safe oRPC contracts and DTO schemas
  planning-center-models/    # Shared Planning Center shapes and calendar rules
  presentation-mode/         # Shared server-side presentation configuration
  config/                    # Shared TypeScript configuration
```

## Development Commands

- `bun run dev`
- `bun run build`
- `bun run start`
- `bun run check`: strict Ultracite lint and formatting checks
- `bun run fix`: auto-fix and format
- `bun run ci`: the local CI gate (check, typecheck, and tests)
- `bun run typecheck`
- `bun run test`
- `bun run test:watch`
- `bun run proof -- doctor`: audit revision-bound PR proof prerequisites

## Testing

```bash
bun run ci
bun run build
```

Tests are colocated under `packages/*/src`, `apps/server/src`, and `apps/web/src`. Feature modules accept narrow typed dependencies so tests can exercise behavior without replacing modules. oRPC inputs and outputs, provider responses, and persisted browser caches are validated with Zod at their respective boundaries.

Pull requests must pass both the GitHub `ci` check and the Vercel deployment check. See [CI/CD](docs/ci-cd.md) for the merge gates, Turborepo remote-cache setup, deployment flow, dependency update policy, and rollback procedure.

For visible or high-risk changes, follow [Proofed delivery](docs/proofed-delivery.md). The repo-local skills under `.agents/skills/` cover setup, app-specific browser verification, verification-skill generation, and independent PR proof.

## Code Quality

Ultracite uses Oxlint and Oxfmt with the strict core, React, Next.js, TanStack, Vitest, shadcn, anti-slop, and React Doctor presets. `oxlint.config.ts` and `oxfmt.config.ts` are the configuration sources. GitHub CI rejects warnings as well as errors, then runs TypeScript and tests. Vercel separately performs the production-shaped build and publishes the preview required for merge. Tests use explicit dummy credentials from `vitest.config.ts`; neither gate receives production secrets. Generated Next.js declarations, database migrations, and scraped API documentation are excluded from formatting.

The OXC VS Code extension is recommended in `.vscode/extensions.json`; workspace settings enable formatting and explicit fixes on save. `bun install` installs the Lefthook pre-commit hook, which fixes and re-stages supported staged files. Run `bun run ci` before submitting changes and `bun x ultracite doctor` when diagnosing the toolchain.

Shared UI primitives expose appearance through variants, with semantic theme tokens for scheduling states. Call sites own layout.

Better Auth is pinned to 1.7.5; keep the registered callback URLs above aligned with the service origin.

## Stacked Pull Requests

Use [GitHub's native stacks](https://github.com/github/gh-stack) for changes with dependent review layers. Keep each layer focused and independently passing `bun run ci` and `bun run build`.

```bash
gh extension install github/gh-stack
gh stack init --base main codex/my-change-foundation
# Commit the foundation, then start its dependent layer.
gh stack add codex/my-change-interface
# Commit and validate the interface, then publish draft PRs.
gh stack submit --auto --remote origin
gh stack view --json
```

Each PR targets the preceding branch; the bottom PR targets `main`. After editing a lower layer, run `gh stack rebase --upstack --remote origin` and resubmit. Update the generated PR titles and descriptions with the behavior changes and validation results.

When every layer is ready and GitHub checks pass, use `gh stack merge <stack-number> --yes --squash` to land the stack together. GitHub enforces the repository's merge requirements for the entire operation. Use `gh stack sync --remote origin` afterward to reconcile local state.

## Planning Center API Docs

Local scraped API docs are in `docs/planning-center-api/`. See [docs/planning-center-api/README.md](docs/planning-center-api/README.md) for export details.
