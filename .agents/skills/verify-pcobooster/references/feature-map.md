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
- Browser status: blocked until the repository has an isolated synthetic Planning Center adapter. Presentation mode is not that adapter.
- Evidence: exact focused test commands and a limitation note. Never use a live provider write as verification evidence.
