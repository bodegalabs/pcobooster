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

### 1. Install dependencies

```bash
bun install
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
  person-card.tsx            # Person row/card with schedule actions
  service-plan-table-selector.tsx
  account-menu.tsx
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
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run test:watch`

## Testing

```bash
bun run typecheck
bun run test
```

Unit tests are colocated with use-cases under `lib/use-cases/planning-center/*.test.ts`.

## Planning Center API Docs

Local scraped API docs are in `docs/planning-center-api/`. See [docs/planning-center-api/README.md](docs/planning-center-api/README.md) for export details.
