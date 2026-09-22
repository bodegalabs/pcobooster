# Repository Guidelines

## Product Naming

- Public/product naming should use `pcobooster.com`.
- Avoid introducing old product names in new docs, UI copy, or PR descriptions unless referring to historical context.

## Project Structure & Module Organization

- `apps/web/`: Next.js product UI. App Router pages, components, hooks, proxy, and public assets live under `apps/web/src` and `apps/web/public`.
- `apps/server/`: Bun/Hono composition root. It mounts Better Auth, oRPC, the OpenAPI reference, CORS, and cache policy.
- `apps/marketing/`: independent static-export Next.js marketing site.
- `packages/contracts/`: browser-safe oRPC contracts, transport schemas, and safe error payloads.
- `packages/planning-center-models/`: browser-safe Planning Center shapes and pure calendar/scheduling rules.
- `packages/presentation-mode/`: server-side presentation-mode guard, seed, and cache namespace.
- `packages/api/src/application/`: Effect programs and typed application faults.
- `packages/api/src/modules/`: server business behavior grouped by the external capability it implements.
- `packages/api/src/transport/orpc/`: thin oRPC adapters; `packages/api/src/orpc.ts` assembles the router.
- `packages/api/src/planning-center/services/`: Planning Center API service wrappers (raw API access only).
- `packages/api/src/db/` and `packages/api/migrations/`: Drizzle client, schema, and migrations.
- `packages/config/`: shared TypeScript configuration.
- Tests stay colocated under `packages/api/src/**/*.test.ts` and `apps/web/src/**/*.test.ts`.

## Build, Test, and Development Commands

- Use Bun for dependency management and scripts. `bun.lock` is the only committed lockfile; do not add `package-lock.json` or run npm-based install workflows for this repo.
- `bun run dev`: start API, product, and marketing through Turborepo (ports 3000, 3001, and 3002).
- `bun run build`: build the Hono service and both Next.js apps through Turborepo.
- `bun run start`: run built app.
- `bun run check` (also `lint`): run Ultracite formatting and type-aware lint checks; warnings fail the check. All selected presets in `oxlint.config.ts` remain strict.
- `bun run lint:ci`: same as `lint` with `--format github` for Action annotations (used by CI).
- `bun run fix` (also `lint:fix`): apply Ultracite fixes and formatting. Review fixes and run validation afterward.
- `bun run ci`: run the strict local CI gate: check, typecheck, and the complete test suite.
- `bun run typecheck`: run TypeScript checks (`tsc --noEmit`).
- `bun run test`: run Vitest test suite once.
- `bun run test:watch`: run Vitest in watch mode.
- `bun run auth:generate`: generate Better Auth artifacts.
- `bun run db:generate`: generate Drizzle migrations from `packages/api/src/db/schema.ts`.
- `bun run db:migrate`: apply Drizzle migrations.
- `bun run db:push`: push schema changes directly for local experiments.
- `bun run db:seed`: run the idempotent seed entrypoint.

### Codex cloud sessions

- The cache-safe Codex environment setup and maintenance scripts live under `scripts/codex-cloud/`; see `docs/codex-cloud.md` for environment configuration.
- `bun run ci` is secretless and does not need a cloud database session.
- Before running the app, a production-shaped build, or database commands in Codex cloud, run `bun run cloud:session:setup` and use the `cloud:*` wrappers so the per-session Neon branch is injected.
- If a cloud session was created, run `bun run cloud:session:teardown` before the final response unless the user explicitly asks to keep it alive. Stale-branch pruning and optional Neon expiry are only failure-recovery backstops.
- Never load Infisical Development `/local`, Staging, or Production in Codex cloud.

## Coding Style & Naming Conventions

- TypeScript throughout; prefer explicit types at module boundaries.
- Use `camelCase` for variables/functions, `PascalCase` for components/types.
- Keep oRPC handlers as transport layers. Put behavior in explicit feature modules and raw external API calls in services.
- Use `oxlint.config.ts` and `oxfmt.config.ts` as the standards source of truth. Keep all selected presets enabled and fix the underlying cause of findings. Prefer runtime validation and type narrowing to assertions; comments should explain verified invariants.
- Shared UI primitives own appearance through variants; compose layout at call sites and use semantic color tokens. Reuse existing variants. Add a variant only for an intentional, reusable design treatment, never solely to relocate forbidden caller styles.

## Testing Guidelines

- Framework: Vitest, with tests colocated beside API and web source.
- Prioritize tests for transforms/matching/sorting logic and Planning Center edge cases.
- Inject narrow typed service dependencies into feature modules and pass fresh test implementations explicitly. Request paths must not rely on process-global credentials or implicit async context. Preserve exact assertions on optional flags so missing values cannot pass as `false`.
- Prefer test-driven fixes for regressions: reproduce the bug or edge case with a focused failing test, then implement the smallest code change that makes it pass.
- Run `bun run ci` and `bun run build` before opening a PR.

## Commit & Pull Request Guidelines

- For dependent changes, use GitHub native stacks with the official `gh-stack` extension; follow the workflow in [README.md](README.md#stacked-pull-requests). Validate each layer and merge through the stack after its checks pass.
- Commit messages: short, imperative, scoped to a change (e.g., `Refactor data flow and harden scheduling foundations`).
- Prefer small commits for follow-up cleanup instead of amend-heavy history.
- PRs should include: summary, behavior changes, test coverage notes, and screenshots for UI changes.
- For visible or high-risk changes, use the repo-local `proofed-pr` workflow in `docs/proofed-delivery.md`; proof must match the current PR head and base.

## Architecture Notes

- Preferred flow: `apps/web` -> oRPC contract -> `apps/server` -> `packages/api/src/transport/orpc/*` -> Effect application program -> `packages/api/src/modules/*` -> service adapter.
- Better Auth is mounted directly by Hono at `/api/auth/*`. Vercel and the local Next.js rewrite keep browser requests on the web origin.
- Product operations use oRPC. Better Auth, liveness health, and the OpenAPI reference are the intentional non-oRPC surfaces.
- Database access uses Drizzle through `packages/api/src/db`; migrations include Better Auth tables.
- Browser query keys, persistence schemas, and cache hydration live in `apps/web/src/lib`. The web app may import contracts and Planning Center models, never `packages/api`.
- Backward compatibility is not a priority during the current dev phase; prefer cleaner APIs/URLs/UX over temporary compatibility shims unless explicitly requested.

## Learned User Preferences

- When replacing behavior, remove legacy or unused code paths instead of keeping parallel implementations.
- Prefer shadcn HoverCard for hover-revealed UI labels/help. Use the default tight `HoverCardContent` (`variant="label"`) or `HoverLabel` for short text; use `variant="panel"` for richer previews. Do not introduce Tooltip-based hover UI; replace existing tooltips with HoverCard when touching nearby code.
- For People detail pages, prefer app-shell breadcrumb navigation over in-page back buttons.
- Prefer lightweight inline and popover edits that persist on close (click outside, Escape, Enter, or field blur where appropriate) instead of explicit Done/Save/Cancel footers. Skip success toasts for these autosaves; keep error toasts. Reuse `apps/web/src/hooks/use-persist-on-close-popover.ts` (`usePersistOnClosePopover`, `useDraftPopover`). Opt into Enter-to-close via `enterToClose` (TanStack Hotkeys, scoped to `contentRef`); do not use Enter-to-close for Command/list popovers where Enter selects rows.
- Keep hover, active, and selection color changes instant. Do not use `transition-colors` or `transition-plan-item`; `local/no-transition-colors` enforces this.

## Learned Workspace Facts

- People availability and blockouts: compare the plan `sort_date` instant to blockouts using each blockout’s Planning Center `time_zone` (calendar-day logic); pass the full ISO `date` through the `people.list` oRPC input. Naive UTC-midnight or date-only string overlap checks can mislabel people near timezone boundaries.
- Congregation-local business dates (plan windows, schedule history frequency, calendar-day deltas) use the org IANA zone from `NEXT_PUBLIC_PLANNING_CENTER_TIME_ZONE` / `PLANNING_CENTER_TIME_ZONE` with shared helpers in `packages/planning-center-models/src/calendar.ts`.
- Person card frequency labels should align with recommendation scoring: distinct calendar service/rehearsal days in org TZ, not raw plan-time row counts or grouped-card counts.

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Fix and format code**: `bun run fix`
- **Check for issues**: `bun run check`
- **Diagnose setup**: `bun x ultracite doctor`

Oxlint + Oxfmt (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Oxlint + Oxfmt Can't Help

Oxlint + Oxfmt's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Oxlint + Oxfmt can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Oxlint + Oxfmt. Run `bun x ultracite fix` before committing to ensure compliance.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
