# Admin app

`apps/admin` is a private Next.js app for account activity. It lives at `https://admin.pcobooster.com` and never appears in the product UI, demos, or presentation mode.

## Access

- The admin app has no sign-in of its own. Sign in on `https://pcobooster.com` first.
- In production, Better Auth scopes the session cookie to `pcobooster.com` (`AUTH_COOKIE_DOMAIN`), so `admin.pcobooster.com` receives it. The admin server forwards that cookie to `https://pcobooster.com/api/rpc`.
- The API authorizes every `admin.*` procedure against `PCOBOOSTER_ADMIN_EMAILS`. A signed-out request redirects to the product sign-in page, and a signed-in account outside the allowlist gets a 404.
- Every response carries `X-Robots-Tag: noindex, nofollow`.

## PostHog

Each user page links to the matching PostHog person. The product identifies PostHog persons by the same Better Auth user ID, and the API sets email, name, and church on sign-in, so the admin page and PostHog describe the same people. See [analytics](analytics.md#server-activity-and-person-profiles).

## Development and deployment

`bun run dev` serves the admin app through `http://127.0.0.1:3001/admin` (its HMR server also listens on 3003). It shares the product's same-origin local session.

Alchemy deploys a dedicated admin Worker with a private API service binding. Production uses `admin.pcobooster.com` and the preserved parent-domain session cookie. Each preview serves its admin Worker through the product's `/admin` route, using only that preview's host-only cookie and D1 database. The admin Worker has no public workers.dev endpoint in preview stages. Its `basePath` is part of the build cache key.
