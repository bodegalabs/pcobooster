# Environment and secret ownership

This is the shared-branch setup for `pcobooster.com`. The three one-way syncs were activated and checked on September 16, 2026. See the [Infisical Vercel sync guide](https://infisical.com/docs/integrations/secret-syncs/vercel) for the connection controls.

| App environment | Infisical source | Vercel target | Neon project `pcobooster` branch |
| --- | --- | --- | --- |
| Local/Development | Development `/` plus local-only `/local` | Development receives `/` only | `development` (schema-only) |
| Preview | Staging `/` | Preview | `preview` (schema-only) |
| Production | Production `/` | Production | `production` (original branch) |

Infisical owns the seven required app keys in each environment: `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `PEOPLE_PAGE_ENABLED`, `PLANNING_CENTER_OAUTH_CLIENT_ID`, `PLANNING_CENTER_OAUTH_CLIENT_SECRET`, and `PCOBOOSTER_ADMIN_EMAILS`. The Vercel records are separated by environment. Edit these keys in Infisical, not Vercel. All three syncs (`vercel-development`, `vercel-preview`, `vercel-production`) have automatic updates enabled. A changed synchronized value applies to new deployments; redeploy to update an existing deployment. [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables)

The Vercel connection uses a team-scoped API token because a project-only token failed Infisical's credential validation. Its current expiry is December 16, 2026; rotate it before then. The failed project-only token still needs revocation in Vercel. Neither token belongs in the repository or any Infisical source folder.

Development `/local` contains `DEV_AUTH_BYPASS`, `PLANNING_CENTER_CLIENT`, and `PLANNING_CENTER_PAT`. It is for the loopback-bound local CLI commands only. Never sync `/local` to Vercel or put the PAT in Preview or Production. The `/local` copies were verified before the root duplicates were removed.

Neon schema-only branches contain the schema without production user, auth, or audit rows. Both branch migration ledgers were baselined to the existing production migration so Drizzle can apply later migrations normally. The current `db:seed` script is intentionally a no-op; the branches are empty, not populated with synthetic fixtures. All Vercel Preview deployments currently share the one `preview` branch, rather than one ephemeral branch per pull request. [Neon schema-only branches](https://neon.com/docs/introduction/branching#schema-only-branches)

The former empty preview Neon project is now `pcobooster-codex-cloud`. It is reserved for isolated Codex cloud agent branches and is not connected to Vercel previews. Its `baseline` branch contains the committed schema only; `scripts/codex-cloud/` provisions and removes a separate `codex-*` child branch per cloud task. See [Codex cloud development](codex-cloud.md).

Preview authentication is not yet proven functional. Its `BETTER_AUTH_URL` and Planning Center OAuth credentials are currently the production values, so a Preview sign-in may redirect to production. A fixed preview domain and matching OAuth callback, or Better Auth's [OAuth proxy](https://www.better-auth.com/docs/plugins/oauth-proxy) with appropriate origin and secret configuration, are separate follow-up work. Do not treat a successful secret sync as proof that Preview login works.
