# Codex cloud development

Codex cloud uses a cache-safe environment bootstrap plus an explicit, per-agent database lifecycle. This keeps dependency setup fast while preventing parallel agents from sharing a mutable database.

## Architecture

The Codex environment setup and maintenance scripts install tools and workspace dependencies only. They never fetch or persist application secrets and never create external resources.

An agent that needs the running application or a real database explicitly starts a cloud session. The session authenticates to Infisical with a dedicated read-only credential, reads only Development `/cloud`, creates an isolated Neon branch, and stores its connection string in ignored local state. Wrapped commands receive that branch as `DATABASE_URL`. Teardown deletes exactly the recorded branch.

Codex currently documents setup and cached-environment maintenance scripts, but not a guaranteed teardown hook. Session setup prunes stale `codex-*` branches older than the configured lifetime. Neon can also enforce automatic branch expiry when that Early Access feature is enabled for the dedicated project.

## Provisioned infrastructure

Codex cloud uses the dedicated Neon project `worship-admin-codex-cloud` (`fancy-tree-14996576`). Its `baseline` branch (`br-lingering-hill-aulkhkmr`) contains only the committed schema migrations and no production or developer data. The agent's Neon API key is project-scoped, so it cannot see or change the `worship-admin` application project.

Infisical Development `/cloud` contains:

| Key | Purpose |
| --- | --- |
| `NEON_API_KEY` | Project-scoped key used to create and delete ephemeral branches. |
| `NEON_PROJECT_ID` | Dedicated Codex cloud Neon project. |
| `NEON_PARENT_BRANCH_ID` | Schema-only baseline branch. |
| `NEON_PARENT_DATABASE_URL` | Baseline URL used only to construct the child branch URL. |
| `BETTER_AUTH_URL` | Loopback origin for cloud app checks. |
| `BETTER_AUTH_SECRET` | Cloud-only signing secret. |
| `PLANNING_CENTER_OAUTH_CLIENT_ID` | Cloud-only or nonfunctional test credential. |
| `PLANNING_CENTER_OAUTH_CLIENT_SECRET` | Cloud-only or nonfunctional test credential. |
| `PEOPLE_PAGE_ENABLED` | Cloud feature setting. |
| `WORSHIP_ADMIN_ADMIN_EMAILS` | Cloud-only admin allowlist. |

Add any optional application configuration from `docs/environment.md` only when a cloud task needs it. Do not import Development `/local`; it contains the human developer PAT and bypass. Do not grant the cloud identity access to Staging or Production.

The Codex environment uses the Infisical credential named `Codex Cloud worship-admin`. It is read-only and statically scoped to Development `/cloud`. This Infisical plan does not expose path-level privileges for machine identities, so the narrower legacy service-token scope is used instead. Revoke and replace that credential if the Codex environment is retired or compromised.

## Codex environment settings

In Codex cloud environment settings:

1. Pin Node.js 24.
2. Set the setup script to:

   ```bash
   bash scripts/codex-cloud/setup.sh
   ```

3. Set the maintenance script to:

   ```bash
   bash scripts/codex-cloud/maintenance.sh
   ```

4. Add `INFISICAL_TOKEN` as an environment variable. Codex removes values entered in its Secrets section before the agent phase, so a runtime Infisical lookup cannot use that section. The token is therefore read-only, path-scoped, and independently revocable. `INFISICAL_CLIENT_ID` plus `INFISICAL_CLIENT_SECRET` remain supported if this project later gains machine-identity path privileges.
5. Optionally set `CODEX_CLOUD_BRANCH_TTL_HOURS`; the default is 48 and the accepted range is 1 through 168. This controls stale-branch pruning and the optional Neon expiry.
6. If Neon branch expiration is enabled for the dedicated project, set `CODEX_CLOUD_NEON_EXPIRY_ENABLED=1`. The default is `0` because Neon's current API schema marks expiration as Early Access.
7. Allow agent-phase network access to `app.infisical.com` and `console.neon.tech`. Setup already has internet access for package installs.

The repository's committed `.infisical.json` supplies the Infisical project ID. Set `INFISICAL_PROJECT_ID` only if the cloud identity should use another project. For non-US Infisical, also set `INFISICAL_DOMAIN` as required by the CLI.

## Agent workflow

Checks that do not need live configuration remain secretless:

```bash
bun run verify
```

Before running the app, a production-shaped build, or a database command:

```bash
bun run cloud:session:setup
bun run cloud:session:status
bun run cloud:session:prune
```

Use the provided wrappers so the isolated database URL wins over the baseline:

```bash
bun run cloud:dev
bun run cloud:build
bun run cloud:db:migrate
bun run cloud:run -- <other command>
```

When finished:

```bash
bun run cloud:session:teardown
```

Session setup prunes stale `codex-*` branches before creating another one, and `cloud:session:prune` can be run independently. When Neon expiry is enabled, Neon also deletes the branch at its recorded deadline. Without that Early Access feature, an interrupted session remains until the next prune or manual deletion.

Session state lives at `.codex-cloud/session.json`, is mode 600, and is ignored by Git. Scripts never write Infisical credentials or access tokens to disk.

## Security boundaries

- Cloud agents never load `/local`, a Planning Center PAT, Staging, or Production.
- The Infisical credential is read-only and restricted to Development `/cloud`.
- The Neon API key is scoped to a dedicated disposable project.
- Every database session uses a unique branch and cleanup deadline.
- Setup and maintenance are safe to cache because they contain no secrets or external session state.
