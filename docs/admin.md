# Admin app

`apps/admin` is a private Next.js app for account activity. It lives at `https://admin.pcobooster.com` and never appears in the product UI, demos, or presentation mode.

## Access

- The admin app has no sign-in of its own. Sign in on `https://pcobooster.com` first.
- In production, Better Auth scopes the session cookie to `pcobooster.com` (`AUTH_COOKIE_DOMAIN`), so `admin.pcobooster.com` receives it. The admin server forwards that cookie to `https://pcobooster.com/api/rpc`.
- The API authorizes every `admin.*` procedure against `PCOBOOSTER_ADMIN_EMAILS`. A signed-out request redirects to the product sign-in page, and a signed-in account outside the allowlist gets a 404.
- Every response carries `X-Robots-Tag: noindex, nofollow`.

## PostHog

Each user page links to the matching PostHog person. The product identifies PostHog persons by the same Better Auth user ID, and the API sets email, name, and church on sign-in, so the admin page and PostHog describe the same people. See [analytics](analytics.md#server-activity-and-person-profiles).

## Local development

`bun run dev` starts the admin app on `http://127.0.0.1:3003` next to the API and product app. Sign in on `http://127.0.0.1:3001`; browsers share `127.0.0.1` cookies across ports, and `DEV_AUTH_BYPASS` also works. `bun run dev:admin` starts only the admin app, which still needs the product app and API running.

## Deployment

The admin app is its own Vercel project, so the product project's `vercel.json` services are unchanged. One-time setup:

1. Create a Vercel project from this repository with **Root Directory** `apps/admin`. `apps/admin/vercel.json` sets the install, build, and ignore commands; the build skips commits that do not touch the admin app or its shared packages.
2. Add the `admin.pcobooster.com` domain to that project.
3. Set `AUTH_COOKIE_DOMAIN=pcobooster.com` in Infisical Production `/`, then redeploy the product project. The admin project needs no application settings.
4. Sign out of `https://pcobooster.com` and sign in again so the browser receives the parent-domain cookie.
5. Optional hardening: enable Vercel Deployment Protection on the admin project for all deployments, including the production domain. This requires a plan that supports protecting production domains.

Preview deployments of the admin project run on `*.vercel.app`, which never receives the `pcobooster.com` session cookie. They redirect to sign-in.
