# CI/CD

Pull requests have two complementary merge gates:

- `verify` runs strict linting, TypeScript checks, tests, and dependency review in one fail-fast GitHub Actions job.
- `Vercel` builds the deployable web and Hono services and publishes a preview from the same commit.

The `main` ruleset requires both checks against the latest base branch. It has no bypass actors, so failed or missing checks cannot be overridden. GitHub Actions does not run again after merge: Vercel's production deployment is the post-merge build, avoiding a duplicate Actions build and a duplicate `main` CI run.

Run the equivalent local checks before opening a pull request:

```bash
bun run verify
bun run build
```

Actions are pinned to immutable commit SHAs. Dependabot checks Bun and GitHub Actions monthly, grouping routine updates to limit pull request and CI churn; security updates remain immediate. GitHub secret scanning and push protection are enabled for the public repository. The workflow has read-only repository permissions, cancels superseded runs on the same pull request, and times out after ten minutes.

Production deploys are created by the Vercel Git integration after merge. If a production deployment is unhealthy, inspect it before changing aliases:

```bash
vercel ls worship-admin
vercel inspect <deployment-url>
vercel logs <deployment-url>
```

Use `vercel rollback <deployment-url>` only after identifying the last known-good production deployment. A rollback changes live traffic and should not be used as a substitute for root-cause analysis.
