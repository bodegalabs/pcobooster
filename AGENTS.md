# Repository Guidelines

## Product Naming

- Public/product naming should use `worshipadmin.com`.
- Avoid introducing old product names in new docs, UI copy, or PR descriptions unless referring to historical context.

## Project Structure & Module Organization

- `app/`: Next.js App Router pages and API routes (`app/api/*`). Keep routes thin and delegate business logic.
- `components/`: UI components (including `components/ui/*` primitives).
- `hooks/`: React Query hooks for client data fetching (`use-*.ts`).
- `lib/use-cases/planning-center/`: business logic and data transforms (preferred home for app behavior).
- `lib/planning-center/services/`: Planning Center API service wrappers (raw API access only).
- `lib/http/`: shared route/error handling and client fetch helpers.
- `lib/db/`: Drizzle schema, shared database client, and PostgreSQL pool setup.
- `db/migrations/`: Drizzle-generated database migrations.
- `lib/use-cases/planning-center/*.test.ts`: Vitest unit tests for use-cases.
- `public/`: static assets. `docs/`: local Planning Center API docs reference.

## Build, Test, and Development Commands

- Use Bun for dependency management and scripts. `bun.lock` is the only committed lockfile; do not add `package-lock.json` or run npm-based install workflows for this repo.
- `bun run dev`: start local Next.js dev server.
- `bun run build`: production build.
- `bun run start`: run built app.
- `bun run lint`: run Oxlint (type-aware + TypeScript diagnostics via `.oxlintrc.json`; plugins include React, Next.js, a11y, import, Vitest, Node, promise, and React performance). Uses `--report-unused-disable-directives-severity=warn`.
- `bun run lint:ci`: same as `lint` with `--format github` for Action annotations (used by CI).
- `bun run lint:fix`: run Oxlint with `--fix` (auto-fixes what the linter supports).
- `bun run typecheck`: run TypeScript checks (`tsc --noEmit`).
- `bun run test`: run Vitest test suite once.
- `bun run test:watch`: run Vitest in watch mode.
- `bun run auth:generate`: generate Better Auth artifacts.
- `bun run db:generate`: generate Drizzle migrations from `lib/db/schema.ts`.
- `bun run db:migrate`: apply Drizzle migrations.
- `bun run db:push`: push schema changes directly for local experiments.
- `bun run db:seed`: run the idempotent seed entrypoint.

## Coding Style & Naming Conventions

- TypeScript throughout; prefer explicit types at module boundaries.
- Use `camelCase` for variables/functions, `PascalCase` for components/types.
- Keep API routes as transport layers: validate with `zod`, return via `handleRoute(...)`.
- Put business rules in use-cases, external API calls in services.
- Follow existing formatting; use Oxlint (`.oxlintrc.json`) as source of truth.

## Testing Guidelines

- Framework: Vitest (`*.test.ts` colocated in `lib/use-cases/planning-center/`).
- Prioritize tests for transforms/matching/sorting logic and Planning Center edge cases.
- Mock service modules (`lib/planning-center/services/*`) in use-case tests.
- Prefer test-driven fixes for regressions: reproduce the bug or edge case with a focused failing test, then implement the smallest code change that makes it pass.
- Run `bun run typecheck && bun run test` before opening a PR.

## Commit & Pull Request Guidelines

- Commit messages: short, imperative, scoped to a change (e.g., `Refactor data flow and harden scheduling foundations`).
- Prefer small commits for follow-up cleanup instead of amend-heavy history.
- PRs should include: summary, behavior changes, test coverage notes, and screenshots for UI changes.

## Architecture Notes

- Preferred flow: `app/api` route -> `lib/use-cases/*` -> `lib/planning-center/services/*`.
- Database access uses Drizzle through `lib/db`; migrations are owned by Drizzle, including Better Auth tables.
- React Query keys are centralized in `lib/query-keys.ts`; use them for hooks/invalidation.
- Use `lib/http/client.ts` (`getJson`, `postJson`) for client-side API calls instead of ad hoc `fetch` code.
- Backward compatibility is not a priority during the current dev phase; prefer cleaner APIs/URLs/UX over temporary compatibility shims unless explicitly requested.

## Learned User Preferences

- When replacing behavior, remove legacy or unused code paths instead of keeping parallel implementations.
- Prefer shadcn HoverCard for hover-revealed UI labels/help. Do not introduce Tooltip-based hover UI; replace existing tooltips with HoverCard when touching nearby code.
- For People detail pages, prefer app-shell breadcrumb navigation over in-page back buttons.
- Prefer lightweight inline and popover edits that persist on close (click outside, Escape, Enter, or field blur where appropriate) instead of explicit Done/Save/Cancel footers. Skip success toasts for these autosaves; keep error toasts. Reuse `hooks/use-persist-on-close-popover.ts` (`usePersistOnClosePopover`, `useDraftPopover`). Opt into Enter-to-close via `enterToClose` (TanStack Hotkeys, scoped to `contentRef`); do not use Enter-to-close for Command/list popovers where Enter selects rows.

## Learned Workspace Facts

- People availability and blockouts: compare the plan `sort_date` instant to blockouts using each blockout’s Planning Center `time_zone` (calendar-day logic); pass full ISO `date` from the client to `/api/people`. Naive UTC-midnight or date-only string overlap checks can mislabel people near timezone boundaries.
- Congregation-local business dates (plan windows, schedule history frequency, calendar-day deltas) use the org IANA zone from `NEXT_PUBLIC_PLANNING_CENTER_TIME_ZONE` / `PLANNING_CENTER_TIME_ZONE` with shared helpers in `lib/planning-center/org-calendar.ts`.
- Person card frequency labels should align with recommendation scoring: distinct calendar service/rehearsal days in org TZ, not raw plan-time row counts or grouped-card counts.
