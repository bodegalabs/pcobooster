# Application configuration

Infisical is the source of truth for every application setting and secret. Do not create `.env`, `.env.local`, environment-specific `.env*` files, or manually maintained application variables in Vercel.

Vercel Functions still consume configuration through `process.env`. The three Infisical Vercel Secret Syncs create those deployment copies automatically:

| Application environment | Infisical source | Vercel target |
| ----------------------- | ---------------- | ------------- |
| Local/Development       | Development `/`  | Development   |
| Preview                 | Staging `/`      | Preview       |
| Production              | Production `/`   | Production    |

Change application values in Infisical only. A synchronized Vercel value is generated deployment state, not a second source of truth. Redeploy after a synchronized value changes because existing deployments retain their original configuration.

## Root application settings

Each Infisical environment's `/` path owns these settings:

| Key | Required | Purpose |
| --- | --- | --- |
| `BETTER_AUTH_URL` | Yes | Public origin used by Better Auth callbacks. |
| `BETTER_AUTH_SECRET` | Yes | Better Auth signing secret. |
| `DATABASE_URL` | Yes | Environment-specific PostgreSQL connection string. |
| `PEOPLE_PAGE_ENABLED` | Yes | Strict `true` or `false` switch for the People dashboard. |
| `PLANNING_CENTER_OAUTH_CLIENT_ID` | Yes | Planning Center OAuth client identifier. |
| `PLANNING_CENTER_OAUTH_CLIENT_SECRET` | Yes | Planning Center OAuth client secret. |
| `PCOBOOSTER_ADMIN_EMAILS` | Yes | Comma-separated admin allowlist. |
| `CORS_ORIGIN` | No | Explicit browser origin when the API is called cross-origin. |
| `DEMO_ACCESS_KEY` | No | Private key in the read-only [demo link](demo.md). The demo stays off unless all three demo keys are set. |
| `DEMO_PLANNING_CENTER_CLIENT` | No | Application ID of the personal access token the demo reads with. |
| `DEMO_PLANNING_CENTER_PAT` | No | Secret of that personal access token. Demo sessions spoof people's personal details and cannot write. |
| `LOG_LEVEL` | No | Server log threshold. |
| `LOG_PLANNING_CENTER_TIMINGS` | No | Set to `1` only while measuring Planning Center requests. |
| `NEXT_PUBLIC_PLANNING_CENTER_TIME_ZONE` | No | Browser fallback while organization timezone data loads. |
| `PLANNING_CENTER_TIME_ZONE` | No | Server fallback when Planning Center has no organization timezone. |

`NEXT_PUBLIC_*` values are compiled into browser assets and are not secrets. They still belong in Infisical so the environment mapping remains explicit.

## Development-only settings

Development `/local` may contain `DEV_AUTH_BYPASS`, `PLANNING_CENTER_CLIENT`, `PLANNING_CENTER_PAT`, and `PRESENTATION_SEED`. Only local commands read this folder. Never include it in a Vercel sync or copy its Planning Center PAT into Staging or Production.

`PRESENTATION_MODE` is command-owned: `bun run dev:present` sets it for that process. It should not be stored in Infisical.

## Platform-provided values

`CI`, `NODE_ENV`, and `VERCEL_*` are execution metadata supplied by CI or Vercel. They are not application configuration and do not belong in Infisical.

CI uses non-production compile-only placeholders for modules that validate required configuration during a production build. Those placeholders grant no service access and are not deployment configuration.
