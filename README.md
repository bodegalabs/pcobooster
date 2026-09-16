# worshipadmin.com

Planning Center scheduling tools for worship admins.

## Overview

This app helps teams schedule people into open positions for specific plans by combining:

- service type and plan selection
- needed team positions grouped by team
- people matching for the selected team/position
- availability and recent scheduling history context
- one-click scheduling into Planning Center

The root route (`/`) redirects to `/services`.

## Setup

This repo uses Bun for dependency management and scripts. Use `bun.lock` as the only lockfile; do not use npm or commit `package-lock.json`.

Use Node.js 24 (see `.node-version`) and Bun 1.3.9 (pinned in `package.json` and CI).

### 1. Install dependencies

```bash
bun install --frozen-lockfile
```

### 2. Configure environment variables

Create a local env file from the template:

```bash
cp .env.example .env.local
```

Required values are documented in `.env.example`:

- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `DATABASE_URL`
- `PLANNING_CENTER_OAUTH_CLIENT_ID`
- `PLANNING_CENTER_OAUTH_CLIENT_SECRET`

### 3. Configure Planning Center OAuth callback URL

In your Planning Center OAuth app settings, add:

- Local: `http://localhost:3000/api/auth/oauth2/callback/planning-center`
- Production: `https://worshipadmin.com/api/auth/oauth2/callback/planning-center`

### 4. Run database migrations and seeds

```bash
bun run db:migrate
bun run db:seed
```

### 5. Start the app

```bash
bun run dev
```

Open `http://localhost:3000`.

### Present locally

```bash
bun run dev:present
```

This enables `PRESENTATION_MODE=1` for the local dev server. The app shows a "Presentation mode" badge. Your signed-in account and organization stay visible. Planning Center people get consistent fictional names, fictional initials, and no photos across candidates, filled positions, search, and People pages. Blockout reasons/descriptions and selected-plan decline notes are masked on the server. Names include a short stable suffix to distinguish people with the same alias.

Search matches the fictional names. Its first request loads the People directory; subsequent requests reuse the account-scoped directory cache for five minutes. Browser people caches and React Query caches are isolated from normal mode. `PRESENTATION_SEED` optionally changes the aliases and browser cache namespace.

Stop the server, run `bun run dev`, and reload open tabs to return to normal mode (remove `PRESENTATION_MODE` if you set it in `.env.local`). The flag is ignored in production and on Vercel. It does not change authentication or grant API access.

This masks person fields for app presentations, not the underlying dataset: IDs, schedules, team/position names, plan titles, and free-form plan-item text remain real. Review those custom labels before a public recording. Actions still write to the real Planning Center account; server logs and external Planning Center pages are outside the masking scope.

## API Routes

All routes are server-side and use authenticated Planning Center access where required.

- `GET /api/service-types`
- `GET /api/plans?service_type_id=...`
- `GET /api/team-positions?service_type_id=...&plan_id=...`
- `GET /api/people?service_type_id=...&position_id=...`
- `GET /api/blockouts/[id]`
- `GET /api/schedule-history/[id]?days=...`
- `POST /api/my-scheduled-plans`
- `POST /api/schedule`
- `GET/POST /api/planning-center/accounts`
- `GET /api/debug/planning-center-context` (debug endpoint)
- `ALL /api/auth/[...all]` (Better Auth handler)

## Project Structure

```text
app/
  api/                       # Next.js API routes
  auth/page.tsx              # Sign-in route
  services/page.tsx          # Service plan selection route
  services/[serviceTypeId]/plans/[planId]/[view]/page.tsx
                             # Main plan workspace route

components/
  dashboard-page.tsx         # Main schedule workflow UI
  schedule/                  # Plan editing and scheduling UI
  people/                    # People dashboard and detail views
  service-plan-table-selector.tsx
  app-shell.tsx              # Navigation and account menu
  ui/                        # UI primitives

hooks/
  use-service-types.ts
  use-plans.ts
  use-team-positions.ts
  use-people.ts
  use-schedule-history.ts
  use-blockouts.ts
  use-my-scheduled-plans.ts

lib/
  use-cases/planning-center/ # Business logic
  planning-center/services/  # Planning Center API wrappers
  http/                      # Shared route/client helpers
  auth.ts                    # Better Auth config
```

## Development Commands

- `bun run dev`
- `bun run build`
- `bun run start`
- `bun run check`: strict Ultracite lint and formatting checks
- `bun run fix`: auto-fix and format
- `bun run verify`: check, typecheck, and tests
- `bun run typecheck`
- `bun run test`
- `bun run test:watch`

## Testing

```bash
bun run verify
bun run build
```

Tests are colocated under `lib/` and `components/`. Use-cases accept narrow typed dependencies so tests can exercise behavior without replacing modules. HTTP responses and persisted caches are validated with shared Zod schemas before entering the app.

## Code Quality

Ultracite uses Oxlint and Oxfmt with the strict core, React, Next.js, TanStack, Vitest, shadcn, anti-slop, and React Doctor presets. `oxlint.config.ts` and `oxfmt.config.ts` are the configuration sources. CI rejects warnings as well as errors, then runs TypeScript, tests, and a production build. Tests use explicit dummy credentials from `vitest.config.ts`; the build step uses compile-only placeholders and requires no production secrets. Generated Next.js declarations, database migrations, and scraped API documentation are excluded from formatting.

The OXC VS Code extension is recommended in `.vscode/extensions.json`; workspace settings enable formatting and explicit fixes on save. `bun install` installs the Lefthook pre-commit hook, which fixes and re-stages supported staged files. Run `bun run verify` before submitting changes and `bun x ultracite doctor` when diagnosing the toolchain.

Shared UI primitives expose appearance through variants, with semantic theme tokens for scheduling states. Call sites own layout.

Better Auth is pinned to the patched 1.6 release line. Moving to 1.7 requires an explicit OAuth callback migration; keep the registered callback URLs above aligned with the auth version.

## Stacked Pull Requests

Use [GitHub's native stacks](https://github.com/github/gh-stack) for changes with dependent review layers. Keep each layer focused and independently passing `bun run verify` and `bun run build`.

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
