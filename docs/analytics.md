# Analytics

pcobooster.com uses one US PostHog project for marketing and product analytics. Vercel remains the feature-flag provider. The previous Vercel Analytics script and dependency are removed.

## Dashboards

- [Marketing & conversion](https://us.posthog.com/project/614621/dashboard/2127632): daily visitors, referring domains, campaigns, devices, pages, and marketing-to-app conversion.
- [Product usage & health](https://us.posthog.com/project/614621/dashboard/2127633): daily/weekly/monthly active users, feature adoption, weekly retention, completed workflows, failure reasons, and sign-in conversion. This is the project's default dashboard.
- [Web Analytics](https://us.posthog.com/project/614621/web): built-in traffic exploration; filter `surface = marketing` for public traffic.

Reporting uses America/Los_Angeles. Dashboards are saved ahead of deployment and remain empty until production events arrive. Retention cohorts require several weeks to mature. No historical Vercel data is imported.

## Collection

The shared `@pcobooster/analytics` package owns configuration and the outbound event allowlist. Both Next.js apps initialize through `instrumentation-client.ts`. The product waits for a successful account response before initializing or identifying, which excludes read-only demo sessions. The anonymous marketing ID carries across the shared origin and merges into the application's user ID on authenticated use. Names, emails, organization names, and Planning Center people are not identified.

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

## Privacy and cost boundaries

- No session replay, heatmaps, automatic click/form capture, rage clicks, console logs, surveys, web experiments, web-vitals capture, or automatic exception capture.
- PostHog flags are disabled, including the flags endpoint; no Vercel flag configuration changes.
- Event names and property keys are allowlisted. Both ordinary event properties and the SDK's top-level person `$set`/`$set_once` fields are scrubbed.
- URLs lose queries/fragments; external referrers retain only their origin. Product URLs use route placeholders for plan, service-type, and person IDs. Unknown and private routes become `/other`; demo-entry events are rejected entirely.
- Campaign attribution retains `utm_source`, `utm_medium`, and `utm_campaign`. Do not put personal information in campaign labels.
- The SDK honors Do Not Track. Sign-out resets analytics identity. Analytics errors never block app operations.
- Collection requires a production build, the production key, and the exact hostname `pcobooster.com`. Local, preview, presentation, and demo traffic do not enter the production charts.
- PostHog's [documented free allowance](https://posthog.com/docs/product-analytics/pricing) is 1 million analytics events/month as of September 23, 2026. Pageviews, pageleaves, identification, and explicit events contribute to usage. This implementation enables no paid add-on or billing upgrade. Billing permissions are separate from the connector; confirm the account's spending limit in PostHog Billing before enabling paid overages.

## Configuration and release

`NEXT_PUBLIC_POSTHOG_KEY` belongs in **Infisical Production `/`**, which syncs to Vercel Production. It is a public ingestion token, not a personal API key. Leave it absent from Development and Staging. Both app build tasks include it in the Turborepo environment/cache key so the independently exported marketing assets receive the correct value.

The host is fixed to `https://us.i.posthog.com`, matching project 614621. Traffic goes directly to PostHog; there is no added proxy or domain cost. A production deployment is required after changing the key. Reverting the analytics PR restores Vercel Analytics; removing the PostHog key and rebuilding disables PostHog capture.

After deployment, open marketing, follow Open app, sign in, and navigate the product. In PostHog's live events, confirm marketing/auth/app pageviews share the expected merged identity and `app opened` appears once per document. Check that no recordings or flag requests are created. Inspect property payloads for scrubbed URLs. Use only read-only product navigation for verification; verify writes through synthetic tests rather than changing live Planning Center data.

Implementation follows the [standard Next.js integration](https://posthog.com/docs/libraries/next-js), [SDK configuration reference](https://posthog.com/docs/libraries/js/config), and [guidance on reducing unwanted events](https://posthog.com/tutorials/fewer-unwanted-events).
