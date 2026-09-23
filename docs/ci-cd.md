# CI/CD

Pull requests have two complementary merge gates:

- `ci` runs strict linting, TypeScript checks, tests, and dependency review in one fail-fast GitHub Actions job.
- `Vercel` builds the deployable web and Hono services and publishes a preview from the same commit.

The target `main` ruleset requires both checks and a merge queue. Once a pull request passes its checks, add it to the queue; GitHub tests the queued commit against the current `main` and merges it with squash only if the required checks pass again. The queue builds and merges one pull request at a time. The ruleset has no bypass actors, so failed or missing checks cannot be overridden. The CI workflow runs on `pull_request` and `merge_group`, but not on a post-merge push to `main`. Vercel builds and deploys the resulting production commit.

Run the equivalent local checks before opening a pull request:

```bash
bun run ci
bun run build
```

Actions are pinned to immutable commit SHAs. Dependabot checks Bun and GitHub Actions monthly, grouping routine updates to limit pull request and CI churn; security updates remain immediate. GitHub secret scanning and push protection are enabled for the public repository. The workflow has read-only repository permissions, cancels superseded runs on the same pull request, and times out after ten minutes.

## Build and verification cache

Turborepo caches build, lint, typecheck, and package-scoped test tasks. Build-time environment variables are declared on the task that actually consumes them, so deployment-specific values such as `VERCEL_URL` do not invalidate every package. The web build also tracks the marketing staging script and restores its generated `public/marketing` directory with the Next.js output.

Vercel Remote Cache is automatic during Vercel builds. GitHub Actions uses the same remote cache when these repository settings exist:

- Actions variable `TURBO_TEAM`: the Vercel team slug
- Actions secret `TURBO_TOKEN`: a dedicated Vercel access token with access to that team

Do not upload `node_modules`, Bun's global package cache, `.next`, or a local `.turbo` directory through `actions/cache`. Those archives are large and branch-scoped, while the remote task cache stores the deterministic outputs that can be reused across pull requests and Vercel builds. Dependency installation remains frozen and Lefthook is disabled in CI and deployment installs because Git hooks are not used there.

Production deploys are created by the Vercel Git integration after merge. If a production deployment is unhealthy, inspect it before changing aliases:

```bash
vercel ls pcobooster
vercel inspect <deployment-url>
vercel logs <deployment-url>
```

Use `vercel rollback <deployment-url>` only after identifying the last known-good production deployment. A rollback changes live traffic and should not be used as a substitute for root-cause analysis.
