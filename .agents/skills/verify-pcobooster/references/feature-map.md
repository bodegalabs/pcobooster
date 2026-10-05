# pcobooster.com feature map

Use the smallest set of flows that covers the changed behavior. Record unsupported branches as limitations in the proof receipt.

## Public marketing shell

- Start: `/` and `/about` on the marketing server or integrated preview.
- Actions: load each route at desktop and narrow viewport widths; follow the primary product link.
- Assert: the page renders without horizontal overflow, public navigation works, and the product link reaches the auth boundary.
- Boundary: `/marketing` without a trailing path is not accidentally treated as a new public product route.
- Evidence: one desktop capture and one narrow capture for a visible change.

## Product auth boundary

- Start: `/services` in a clean unauthenticated browser context.
- Actions: load the route directly, then navigate to `/auth`.
- Assert: protected product content is not exposed and the sign-in surface renders without an uncaught console error.
- Boundary: public `/`, `/about`, and `/marketing/*` remain reachable without a product session.
- Evidence: auth destination and one representative public route when routing changes.

## Service plan and lineup, read-only

- Start: a matching-revision preview or local development session with an explicitly authorized Planning Center test account.
- Actions: open a service type, choose a plan, inspect the lineup and each available view.
- Assert: plan identity, dates, item order, and view navigation remain coherent.
- Boundary: empty plans and slow provider responses preserve a usable shell.
- Safety: do not add, update, delete, reorder, or schedule against a live Planning Center account.
- Evidence: the changed view and the relevant boundary state.

## People availability, read-only

- Start: `/people` for a known plan date in an authorized non-production context.
- Actions: filter or select a person and open the detail route.
- Assert: availability, blockout labels, schedule frequency, and breadcrumbs agree with the selected plan date.
- Boundary: timezone-adjacent dates and missing optional provider flags are covered by focused automated tests even when no safe browser fixture exists.
- Evidence: the changed roster/detail state; cite the focused test in proof notes for a nonvisual boundary.

## Provider mutations

- Current surface: focused module, transport, and cache-optimism tests only.
- Covered behavior: schedule assignment, plan-item create/update/delete/reorder, and associated cache updates.
- Adapter: `apps/server/src/synthetic-schedule.test.ts` exercises the actual shared client, server and application against a synthetic Planning Center scheduling capability. Use its dependency injection for provider-write proof.
- Browser/native UI status: fixture transport can prove rendering and query invalidation separately; do not claim it executes the actual application/provider adapter. Presentation mode still writes to the live provider.
- Evidence: exact focused test commands and a limitation note. Never use a live provider write as verification evidence.

## Expo native workflows

- Start: matching source revision built with Expo prebuild/xcodebuild and installed on an iOS simulator; use the isolated fictional transport in `apps/mobile/scripts/synthetic-server.mts` for UI actions.
- Actions: browser PKCE sign-in/cancel, Services search/date filters, plan views, Assign candidates, People/person, Songs/chart, account/demo switching, offline/reconnect and logout.
- Assert: SecureStore restore works in the signed simulator app, cached Dates and string timestamps retain their contracts, completed progressive batches appear without waiting for all people, hidden screens pause new requests, and errors retain drafts/retry actions.
- Boundaries: exact callback/state and stale-401 ownership, secure-storage write ordering, account/token/demo/origin cache isolation, congregation-day rules and real provider-write completion require focused tests as well as UI checks.
- Evidence: fictional-data screenshots/video, native build command/log, export gate and exact focused test commands. Record Android build/emulator, release archive and real-device status separately. A simulator binary build alone does not establish Keychain or feature acceptance.
