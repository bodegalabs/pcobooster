# Application configuration

Infisical is the source of truth for application secrets. Alchemy reads them at deployment time and binds the approved values to Cloudflare Workers. Do not create application `.env` files or maintain a second set of values in Cloudflare. Redeploy after changing secrets; browser `NEXT_PUBLIC_*` values require a rebuilt frontend.

## Environment boundaries

| Use | Infisical source | Runtime |
| --- | --- | --- |
| Local development | Original project, Development `/` and `/local` | Local Workers and persistent local D1 |
| Codex cloud | Original project, Development `/` and `/cloud` | Local Workers and local D1 |
| Previews | `pcobooster-preview`, Staging `/` | Independent `pr-<number>` Workers and D1 |
| Production | Dedicated production deployment project, Production `/` | `prod` Workers and retained D1 |

The preview project ID is `586fd830-7861-4b84-a8a6-d05c9bf7a14a`. Its Viewer identity has no membership in the original project. Infisical Free cannot limit Viewer to an environment; separate projects therefore contain only credentials suitable for that deployment tier. Never copy development PATs, production session secrets, demo credentials, or the source PostgreSQL connection into the preview project.

The production deployment project is `pcobooster-production` (`2eca20e1-20ac-4f06-a086-99ea5c590483`). Its app secrets and main-bound Viewer OIDC identity are configured. Its Cloudflare token still needs the production zone to exist before zone-scoped permissions can be granted. Do not approve a production Actions job until that token is verified. The original project remains the source for the read-only PostgreSQL export; keep its legacy secrets until cutover verification and explicit cleanup approval.

## Application bindings

| Key | Owner and purpose |
| --- | --- |
| `DB` | Alchemy D1 binding; replaces runtime `DATABASE_URL`. |
| `BETTER_AUTH_SECRET` | Infisical signing secret. Production retains its existing value to preserve sessions. Alchemy derives a separate signing key for each preview stage from the preview master. |
| `OAUTH_PROXY_SECRET` | Shared production/preview broker secret. Preview callbacks use production only to finish the provider exchange; preview accounts and sessions stay in preview D1. |
| `PLANNING_CENTER_OAUTH_CLIENT_ID`, `PLANNING_CENTER_OAUTH_CLIENT_SECRET` | Planning Center application credentials from Infisical. |
| `PCOBOOSTER_ADMIN_EMAILS` | Comma-separated admin allowlist. |
| `PEOPLE_PAGE_ENABLED` | Strict `true` or `false` feature setting. |
| `DEMO_ACCESS_KEY`, `DEMO_PLANNING_CENTER_CLIENT`, `DEMO_PLANNING_CENTER_PAT` | Optional production-only read-only demo. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional production analytics key, compiled into browser assets and bound to the API. |
| `PLANNING_CENTER_TIME_ZONE` | Server fallback, default `America/Los_Angeles`. |
| `NEXT_PUBLIC_PLANNING_CENTER_TIME_ZONE` | Optional browser fallback during organization loading. |

Alchemy owns stage origins, `BETTER_AUTH_URL`, `CORS_ORIGIN`, cookie domain, OAuth receiver allowlist, `NODE_ENV`, and service bindings. Production uses parent-domain cookies for `admin.pcobooster.com`; previews use host-only cookies and serve admin at `/admin` on the preview origin. Do not override these derived values in Infisical.

## Developer credentials

Development `/local` may contain `DEV_AUTH_BYPASS`, `PLANNING_CENTER_CLIENT`, `PLANNING_CENTER_PAT`, and `PRESENTATION_SEED`. Only local commands read it. Codex cloud reads only Development `/cloud`; never `/local`, Staging, or Production. Alchemy binds these development keys only in stage `local`.

`PRESENTATION_MODE` is process-owned: `bun run dev:present` enables it. Every deployed Worker uses production mode, which disables presentation mode and local authentication bypass.

## Deployment credentials

Local deployment uses the saved Alchemy profile. Use `bun alchemy profile edit` to sign in or adjust it; credentials do not belong in shell history or repo files. The `deploy:preview` wrapper removes CI credential overrides so the local profile remains authoritative.

GitHub Actions retrieves a narrowly scoped Cloudflare token from Infisical using OIDC after the environment approval gate. Account, project, and identity IDs are GitHub environment variables, not secrets. Tokens never become app Worker bindings. See [CI/CD](ci-cd.md) for permissions and trust boundaries.

`DATABASE_URL` remains only in the original Infisical project for read-only migration/reconciliation and rollback evidence. The deployed app cannot connect to Neon.
