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
- `lib/**/*.test.ts` and `components/**/*.test.ts`: colocated Vitest tests.
- `public/`: static assets. `docs/`: local Planning Center API docs reference.

## Build, Test, and Development Commands

- Use Bun for dependency management and scripts. `bun.lock` is the only committed lockfile; do not add `package-lock.json` or run npm-based install workflows for this repo.
- `bun run dev`: start local Next.js dev server.
- `bun run build`: production build.
- `bun run start`: run built app.
- `bun run check` (also `lint`): run Ultracite formatting and type-aware lint checks; warnings fail the check. All selected presets in `oxlint.config.ts` remain strict.
- `bun run lint:ci`: same as `lint` with `--format github` for Action annotations (used by CI).
- `bun run fix` (also `lint:fix`): apply Ultracite fixes and formatting. Review fixes and run validation afterward.
- `bun run verify`: run the strict check, typecheck, and complete test suite.
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
- Use `oxlint.config.ts` and `oxfmt.config.ts` as the standards source of truth. Keep all selected presets enabled and fix the underlying cause of findings. Prefer runtime validation and type narrowing to assertions; comments should explain verified invariants.
- Shared UI primitives own appearance through variants; compose layout at call sites and use semantic color tokens. Reuse existing variants. Add a variant only for an intentional, reusable design treatment, never solely to relocate forbidden caller styles.

## Testing Guidelines

- Framework: Vitest, with tests colocated under `lib/` and `components/`.
- Prioritize tests for transforms/matching/sorting logic and Planning Center edge cases.
- Inject narrow typed service dependencies into use-cases and pass fresh test implementations explicitly. Keep imported module exports and service singletons intact; spies may observe local test instances or runtime I/O. Preserve exact assertions on optional flags so missing values cannot pass as `false`.
- Prefer test-driven fixes for regressions: reproduce the bug or edge case with a focused failing test, then implement the smallest code change that makes it pass.
- Run `bun run verify` and `bun run build` before opening a PR.

## Commit & Pull Request Guidelines

- For dependent changes, use GitHub native stacks with the official `gh-stack` extension; follow the workflow in [README.md](README.md#stacked-pull-requests). Validate each layer and merge through the stack after its checks pass.
- Commit messages: short, imperative, scoped to a change (e.g., `Refactor data flow and harden scheduling foundations`).
- Prefer small commits for follow-up cleanup instead of amend-heavy history.
- PRs should include: summary, behavior changes, test coverage notes, and screenshots for UI changes.

## Architecture Notes

- Preferred flow: `app/api` route -> `lib/use-cases/*` -> `lib/planning-center/services/*`.
- Database access uses Drizzle through `lib/db`; migrations are owned by Drizzle, including Better Auth tables.
- React Query keys are centralized in `lib/query-keys.ts`; use them for hooks/invalidation.
- Use `lib/http/client.ts` for client-side API calls, passing a response schema from `lib/api-schemas.ts`. Validate untrusted HTTP and persisted-cache data with Zod before using domain types.
- Backward compatibility is not a priority during the current dev phase; prefer cleaner APIs/URLs/UX over temporary compatibility shims unless explicitly requested.

## Learned User Preferences

- When replacing behavior, remove legacy or unused code paths instead of keeping parallel implementations.
- Prefer shadcn HoverCard for hover-revealed UI labels/help. Use the default tight `HoverCardContent` (`variant="label"`) or `HoverLabel` for short text; use `variant="panel"` for richer previews. Do not introduce Tooltip-based hover UI; replace existing tooltips with HoverCard when touching nearby code.
- For People detail pages, prefer app-shell breadcrumb navigation over in-page back buttons.
- Prefer lightweight inline and popover edits that persist on close (click outside, Escape, Enter, or field blur where appropriate) instead of explicit Done/Save/Cancel footers. Skip success toasts for these autosaves; keep error toasts. Reuse `hooks/use-persist-on-close-popover.ts` (`usePersistOnClosePopover`, `useDraftPopover`). Opt into Enter-to-close via `enterToClose` (TanStack Hotkeys, scoped to `contentRef`); do not use Enter-to-close for Command/list popovers where Enter selects rows.
- Keep hover, active, and selection color changes instant. Do not use `transition-colors` or `transition-plan-item`; `local/no-transition-colors` enforces this.

## Learned Workspace Facts

- People availability and blockouts: compare the plan `sort_date` instant to blockouts using each blockout’s Planning Center `time_zone` (calendar-day logic); pass full ISO `date` from the client to `/api/people`. Naive UTC-midnight or date-only string overlap checks can mislabel people near timezone boundaries.
- Congregation-local business dates (plan windows, schedule history frequency, calendar-day deltas) use the org IANA zone from `NEXT_PUBLIC_PLANNING_CENTER_TIME_ZONE` / `PLANNING_CENTER_TIME_ZONE` with shared helpers in `lib/planning-center/org-calendar.ts`.
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
