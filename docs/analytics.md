# Analytics

pcobooster.com uses one US PostHog project for marketing and product analytics. Vercel remains the feature-flag provider. The previous Vercel Analytics script and dependency are removed.

## Dashboards

- [Marketing & conversion](https://us.posthog.com/project/614621/dashboard/2127632): daily visitors, referring domains, campaigns, devices, pages, and marketing-to-app conversion.
- [Product usage & health](https://us.posthog.com/project/614621/dashboard/2127633): daily/weekly/monthly active users, feature adoption, weekly retention, completed workflows, failure reasons, and sign-in conversion. This is the project's default dashboard.
- [Web Analytics](https://us.posthog.com/project/614621/web): built-in traffic exploration; filter `surface = marketing` for public traffic.

Reporting uses America/Los_Angeles. Dashboards are saved ahead of deployment and remain empty until production events arrive. Retention cohorts require several weeks to mature. No historical Vercel data is imported.

### Dashboards as code

The project settings above, both dashboards, their tile order, and every insight on them are defined in [`packages/analytics/src/reports.ts`](../packages/analytics/src/reports.ts). They sit next to the event allowlist in `privacy.ts`, so a report can only reference events and properties the browser actually sends. The `pcobooster-posthog` Alchemy stack ([`alchemy.posthog.ts`](../alchemy.posthog.ts), stage `prod`, Cloudflare state) reconciles them with project 614621. The small PostHog providers live in `scripts/posthog/`.

Existing objects carry their PostHog IDs, so the stack adopts them in place and the links above keep working. A deploy writes only fields that differ from PostHog; an unchanged definition makes no PostHog writes. Only the listed project settings are managed; every other setting stays as configured in PostHog. Removing a definition soft-deletes an insight, which can be restored in PostHog. The project and dashboards are retained, so the stack never deletes them.

To change a dashboard:

1. Edit `reports.ts`. Add an insight without an `id` to create it; keep `id` on existing ones.
2. Run `bun run posthog:plan` (a dry run) and check that only the intended objects change.
3. Open a PR. `scripts/posthog/resources.test.ts` checks the definitions against a snapshot of the live project in `scripts/posthog/fixtures/`. Update the snapshot when a change is intended.
4. After merge, run `bun run posthog:deploy`. CI does not apply PostHog changes.

Edits made in the PostHog UI to managed fields are overwritten by the next deploy. Make them in code instead, or copy them into `reports.ts` first.

Both scripts read the production Infisical project: its Cloudflare token for Alchemy state, and a PostHog personal API key, `POSTHOG_PERSONAL_API_KEY`, stored in the `/posthog` folder. CI reads only `/`, so it never sees that key. Scope the key to project 614621 with `project:read`, `project:write`, `dashboard:read`, `dashboard:write`, `insight:read`, and `insight:write`.

### Deploy annotations

After `verify-deployment.ts` succeeds, the production CI job runs `scripts/posthog/annotate-deploy.ts`. It adds a project-wide annotation, "Deployed <commit sha>", so charts show when each release went live. It uses `POSTHOG_ANNOTATION_API_KEY` from Infisical Production `/`, a personal API key scoped to project 614621 with only `annotation:write`. If the key is missing, or PostHog rejects the request, the step logs a warning and the deploy still succeeds.

## Collection

The shared `@pcobooster/analytics` package owns configuration and the outbound event allowlist. Both Next.js apps initialize through `instrumentation-client.ts`. The product waits for a successful account response before initializing or identifying, which excludes read-only demo sessions. The anonymous marketing ID carries across the shared origin and merges into the application's user ID on authenticated use. The browser never sends names, emails, or organization names; the server sets them on the person profile (see below). Planning Center people are never identified.

| Event | Meaning | Additional properties |
| --- | --- | --- |
| `$pageview`, `$pageleave` | Public/auth page or authenticated product navigation | `surface`, `is_authenticated`, scrubbed path, browser/device, referrer/campaign |
| `marketing cta clicked` | A marketing link to the product was activated | `cta_location`: header/body |
| `sign in started` | User clicked Continue with Planning Center | None |
| `sign in failed` | Preparing the OAuth navigation failed | None |
| `app opened` | First authenticated account response in a document, or a different user identified | None |
| `workflow completed` | A selected oRPC write resolved successfully | `operation`, `duration_ms` |
| `workflow failed` | A selected oRPC write rejected, excluding cancellation | `operation`, bounded `error_code` |

Tracked writes: schedule assign/remove/status; plan-item create/update/delete/reorder; plan-time create/update/delete; account selection. Background queries and optimistic UI updates do not count as completed writes. Health charts measure client-observed write outcomes; they do not monitor uptime, background query errors, or all browser exceptions. A network failure after a provider committed a write can still appear as a failure from the browser's perspective.

Active users are distinct authenticated application users with pageviews. Marketing visitors are browser/cookie identities. `app opened` is not a signup event. The marketing funnel includes returning signed-in users; the sign-in funnel measures started sign-in to app access, not new registrations. Do Not Track, ad blockers, and failed network delivery can reduce counts.

### Server activity and person profiles

The API mirrors every `activity_events` audit row to PostHog, keyed by the same Better Auth user ID the browser identifies with, so one PostHog person shows both browser usage and server-side auth and scheduling activity. Delivery is best effort: the database row is written first and remains the full audit log, and a PostHog failure is logged without affecting sign-in or writes. Only Vercel Production (`VERCEL_ENV=production`) with `NEXT_PUBLIC_POSTHOG_KEY` forwards events.

| Event | Source row | Properties |
| --- | --- | --- |
| `signed in` | `auth_session_created` | `$set`: `email`, `name`, `organization_id`, `organization_name` |
| `signed out` | `auth_session_deleted` | None |
| `planning center account linked` | `auth_account_linked` | `organization_id` |
| `schedule assign attempted` | `schedule_attempt` | `success`, `status_code`, `error_code`, `service_type_id`, `plan_id`, `team_id`, `position_id`, `one_off` |
| `schedule status changed` | `schedule_status_change` | Same as above plus `schedule_status` |
| `schedule person removed` | `schedule_remove` | Same as assign |

Every server event also carries `source: server`, `success`, and `status_code`. IP addresses, user agents, and Planning Center person IDs stay in the database only. Person profiles pick up email, name, and church on each new sign-in, so accounts that have not signed in since this shipped remain unlabeled until they do.

## Privacy and cost boundaries

- No marketing, auth, or demo recordings. No heatmaps, automatic click/form capture, rage clicks, console logs, surveys, web experiments, web-vitals capture, or automatic exception capture.
- PostHog feature flag evaluation is disabled; no Vercel flag configuration changes. The web app fetches PostHog remote configuration and the recorder asset for replay; marketing disables both external dependency loading and remote configuration.
- Analytics event names and property keys are allowlisted. Replay snapshots are separately accepted only on authenticated product routes; rrweb masks their contents before transmission. Both ordinary event properties and the SDK's top-level person `$set`/`$set_once` fields are scrubbed in the browser; only the server sets identifying person properties.
- URLs lose queries/fragments; external referrers retain only their origin. Product URLs use route placeholders for plan, service-type, and person IDs. Unknown and private routes become `/other`; demo-entry events are rejected entirely.
- Campaign attribution retains `utm_source`, `utm_medium`, and `utm_campaign`. Do not put personal information in campaign labels.
- The SDK honors Do Not Track. Sign-out stops recording before resetting analytics identity. Analytics errors never block app operations.
- Collection requires a production build, the production key, and the exact hostname `pcobooster.com`. Local, preview, presentation, and demo traffic do not enter the production charts.
- PostHog's [documented free allowance](https://posthog.com/docs/product-analytics/pricing) is 1 million analytics events/month as of September 23, 2026. Pageviews, pageleaves, identification, and explicit events contribute to usage. No billing upgrade is enabled. Replay has a separate free allowance and usage counter described below. Billing permissions are separate from the connector; confirm the account's spending limit in PostHog Billing before enabling paid overages.

## Web-app session replay

[Recordings](https://us.posthog.com/project/614621/replay) start only after a successful non-demo account response on `/services`, `/people`, or their supported detail routes. The SDK starts with recording disabled even on auth pages, then uses `startSessionRecording()` without sampling overrides. Marketing is a separate document and never starts replay. Sign-out and demo access stop the recorder; the outbound snapshot guard independently rejects marketing, auth, demo, admin, and unknown routes.

Project controls: **20% of eligible sessions**, **10-second minimum duration**, **30-day retention**, and only the `https://pcobooster.com` origin. Change sampling and minimum duration in PostHog replay settings without redeploying. Sampling is probabilistic, not a spending cap. PostHog currently includes [5,000 web recordings/month free](https://posthog.com/session-replay/pricing); the account's billing cap remains unverified.

Replay masks all page text and inputs, blocks media/iframes, removes document metadata, and retains only class/type/role DOM attributes. Names, labels, values, URLs, and data attributes are therefore hidden, which intentionally reduces replay detail. Navigation URLs are normalized with the same route scrubber as analytics. Console, network bodies/headers/performance, canvas, cross-origin frames, and JSON-LD capture remain disabled. These controls follow [PostHog replay privacy guidance](https://posthog.com/docs/session-replay/privacy).

## Configuration and release

`NEXT_PUBLIC_POSTHOG_KEY` belongs in **Infisical Production `/`**, which syncs to Vercel Production. It is a public ingestion token, not a personal API key. Leave it absent from Development and Staging. Both app build tasks include it in the Turborepo environment/cache key so the independently exported marketing assets receive the correct value.

The host is fixed to `https://us.i.posthog.com`, matching project 614621. Traffic goes directly to PostHog; there is no added proxy or domain cost. A production deployment is required after changing the key. Reverting the analytics PR restores Vercel Analytics; removing the PostHog key and rebuilding disables PostHog capture.

After deployment, open marketing, follow Open app, sign in, and navigate the product. In PostHog's live events, confirm marketing/auth/app pageviews share the expected merged identity and `app opened` appears once per document. Confirm recordings appear only for sampled authenticated app sessions, and that marketing/auth/demo remain unrecorded. Check masked replay content and the absence of feature flag requests. Inspect property payloads for scrubbed URLs. Use only read-only product navigation for verification; verify writes through synthetic tests rather than changing live Planning Center data.

Implementation follows the [standard Next.js integration](https://posthog.com/docs/libraries/next-js), [SDK configuration reference](https://posthog.com/docs/libraries/js/config), and [guidance on reducing unwanted events](https://posthog.com/tutorials/fewer-unwanted-events).
