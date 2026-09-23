# CI/CD

The Cloudflare workflow separates secretless validation from approved deployment. `ci` runs dependency review, strict linting, typechecks, and tests. `cloudflare-build` builds both Next.js apps into OpenNext Worker bundles without credentials. Both run for pull requests and merge queue commits; deployment jobs never run for `merge_group`.

Run the local gates before opening a pull request:

```sh
bun run ci
bun run build
bun run build:cloudflare
```

Use Node 24 and the pinned Bun version. Stop local development before production builds because Next.js shares its output directory between those modes. Actions are pinned to immutable commits and installs use the frozen Bun lockfile. There is no Vercel remote-cache credential in CI.

## Preview lifecycle

Same-repository pull requests request a deployment only after validation passes. Each deployment waits for Jake's approval in the `cloudflare-preview` GitHub environment. Fork PRs receive secretless checks only. Approval grants the checked-out revision access to preview app secrets and an account-scoped Cloudflare token, so review workflow/dependency changes before approving.

An approved job authenticates to Infisical using GitHub OIDC, checks the PR is still open at the expected head, and runs `bun alchemy deploy --stage pr-<number>`. Alchemy owns a separate D1 database and API/web/admin Workers for each PR. The preview URL is exposed in GitHub's deployment environment. Production data is never copied into these databases.

Closing a same-repository PR requests cleanup through the same approval gate. That job uses `pull_request_target` only to check out trusted `main`; it never executes PR code. It verifies the PR is still closed before `bun alchemy destroy --stage pr-<number>`. Deployment and cleanup share a per-stage concurrency group and do not interrupt an active state update. Reopening the PR creates a fresh deployment request.

## Production

A push to `main`, or a manual CI run on `main` with `deploy_production`, requests production deployment after checks. `cloudflare-production` accepts only the `main` branch and requires Jake's approval. The job rejects a revision superseded by newer `main` before reading production secrets.

Infisical's production OIDC identity must bind the environment subject and the `ref=refs/heads/main` claim. The production project contains production app secrets and its own Cloudflare token; it excludes development PATs and migration-only `DATABASE_URL`.

Set `CLOUDFLARE_CUSTOM_DOMAINS=1` in the production GitHub environment only after the data migration and DNS cutover preparation are complete. Before that, Alchemy provisions a production candidate without attaching the live domains. Do not approve CI production deploys until the production project, identity, token, and initial data import have been verified.

## OIDC and token scope

GitHub environment variables are `INFISICAL_PROJECT_ID`, `INFISICAL_IDENTITY_ID`, `INFISICAL_ENV_SLUG`, and `CLOUDFLARE_ACCOUNT_ID`. Infisical supplies `CLOUDFLARE_API_TOKEN`; no long-lived Infisical credential is stored in GitHub.

The issuer/discovery URL is `https://token.actions.githubusercontent.com`; audience is `https://github.com/bodegalabs/pcobooster`. This repository uses immutable OIDC subjects:

- Preview: `repo:bodegalabs@305914027/pcobooster@1125110564:environment:cloudflare-preview`
- Production: `repo:bodegalabs@305914027/pcobooster@1125110564:environment:cloudflare-production`

Access tokens have a one-hour TTL and maximum TTL. The preview identity is Viewer only in `pcobooster-preview`. Its Cloudflare token permits Workers Scripts Write, D1 Write, and Secrets Store Write in the current account and expires September 23, 2027. It has no DNS, registrar, R2, or token-administration permission. These account-level permissions can affect other resources in that account; project separation does not create resource-level Cloudflare isolation. Only trusted, explicitly approved revisions may deploy.

The production token has the same account-level deployment permissions, plus DNS Write and Zone Read scoped to `pcobooster.com`; it also expires September 23, 2027. It is stored only in the production Infisical project. `Cloudflare.state()` shares the bootstrapped Alchemy state Worker and Secrets Store across stages. Keep their credentials out of application bindings, artifacts, and logs.

## Merge gates and migration status

The existing live `main` ruleset still requires `ci` and `Vercel – pcobooster`. Replace the Vercel requirement with the successful `cloudflare-build` GitHub Actions check after this workflow has run on the migration PR. Preserve the merge queue, squash-only merging, and absence of bypass actors. Never remove the old gate merely to bypass a red or missing replacement.

Cloudflare/D1 became the live production system on September 23, 2026; see the [cutover record](cloudflare-cutover.md). Vercel temporarily forwards cached DNS traffic to Cloudflare, and Neon is retained as the source snapshot. Follow [database migration and rollback](database.md): after D1 accepts new writes, routing back to the old PostgreSQL snapshot alone is not a safe rollback.
