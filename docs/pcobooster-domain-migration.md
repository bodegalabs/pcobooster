# Production domain migration

This is the historical September 18 domain rename. The current hosting, DNS, data preservation, and registrar status are in the [September 23 Cloudflare cutover record](cloudflare-cutover.md).

September 18, 2026: move production from `worshipadmin.com` to `pcobooster.com` on the Vercel project now named `pcobooster`.

## Configuration

- Canonical origin: `https://pcobooster.com`.
- `www.pcobooster.com` redirects to the canonical origin.
- `worshipadmin.com` and `www.worshipadmin.com` redirect directly to the canonical origin with HTTP 308, preserving paths and query strings.
- Planning Center OAuth application 5235, owned by Jake Bodea's Org, is named PCOBooster and uses `https://pcobooster.com` as its application URL.
- Its new callback is `https://pcobooster.com/api/auth/callback/planning-center`. Existing localhost and old-domain callbacks remain registered for rollback.
- Infisical Production `/` owns `BETTER_AUTH_URL=https://pcobooster.com`; verify the Vercel Production copy before redeploying.
- Database, Better Auth secret, OAuth client ID, and OAuth client secret remain unchanged. Users must sign in again because browser cookies are scoped to the old host. Browser-local preferences and caches also start fresh on the new origin.
- Existing support URL remains `https://jakebodea.com/contact`.

## Cutover verification

Production deployment `dpl_GVjJgyJuJat3VHq2aAVEMihz2W3o` rebuilt commit `2490f4846b799edd6e8bf13a322fd7eaba74e31c` with the new environment and reached Ready. HTTPS `/auth` returns 200. The sign-in endpoint returns the exact new callback above and PKCE method `S256`. The user completed interactive Planning Center sign-in, and the new domain displayed authenticated services. After enabling the old-domain redirect, a bookmarked plan URL redirected to the same path on the new domain and loaded its plan details and team positions.

Verify HTTPS, the production OAuth redirect URI, a complete browser sign-in, and authenticated Planning Center data before redirecting the old domain. Check old-domain redirects with a nested path and query string. Requests already in an old-domain OAuth flow may require restarting sign-in on the new domain.

The inspected repository has no implemented webhook receiver or email/payment integration requiring a domain update. The developer organization's Planning Center webhook page has no subscriptions. Neither domain's Vercel DNS listing contains mail records.

## Preview limitation

Preview `BETTER_AUTH_URL` now points to `https://pcobooster.com`, a pre-existing limitation documented in [environment ownership](neon-infisical-preview.md). This does not fix Preview authentication. A dedicated preview origin and matching OAuth callback or a deliberately configured OAuth proxy remain separate work. Local Development continues using `http://localhost:3000`.

## Rollback

1. Remove the old domain's Vercel redirect so it can serve the application again.
2. Restore Infisical Production `/` `BETTER_AUTH_URL` to `https://worshipadmin.com` and verify the Vercel sync.
3. Redeploy the known production commit with that environment, then verify old-domain sign-in. Rolling back a deployment alone does not restore the environment value used by future builds.
4. Keep the new domain registered and attached while investigating. Do not rotate credentials or change databases for a domain rollback.
