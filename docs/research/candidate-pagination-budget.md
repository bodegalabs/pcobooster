# Candidate pagination and request-budget audit

Status: draft architectural remedy and reproducible diagnostic. This document does not implement the remedy or claim that collection truncation is fixed.

## Confirmed failures

Run from the repository root:

```sh
bun scripts/research/reproduce-candidate-pagination.ts
```

The diagnostic runs `getCandidateDetails` with the real `PlanningCenterPeopleService`, core client, pagination decoder, and 40-request accounting cap. An injected HTTP client returns synthetic Planning Center responses; it makes no network requests, reads no credentials, and changes no data. Its dummy authentication values are not usable credentials. One counted timezone read models the organization lookup. Each scenario starts with fresh caches.

Observed results on October 2, 2026:

| Scenario | Fixture | Accounted requests | Mock HTTP requests | Result |
| --- | --- | --- | --- | --- |
| Recurring dates | 16 candidates; one daily recurring blockout each; 365 occurrences across four pages | 40 | 39 | `PlanningCenterSubrequestLimitError`; no batch returned |
| Plan times | 16 requested candidates; seven admitted; three distinct rehearsal plans per admitted person; 101 plan times per plan across two pages | 40 | 39 | Same failure; 25 plan-time pages sent; no batch returned |

The difference between accounting and HTTP requests is the counted timezone lookup. Concurrent plan-time reads can produce several budget rejection logs after the first failure. The fixtures establish a pagination failure, not the frequency of these collection sizes in production. The recurring fixture generates actual daily dates, including the selected plan date. Current code fetches every date page before it evaluates whether any occurrence covers that date.

## Cause and affected paths

`packages/api/src/planning-center/request-budget.ts` sets the transport cap to 40 and progressive planning budget to 36, reserving four requests for retries. Those values should remain unchanged.

The collection readers in `packages/api/src/planning-center/services/people-service.ts` allow ten pages each:

- `getPersonBlockouts` reads blockout parents.
- `getPersonBlockoutDates` reads generated dates of one recurring blockout.
- `getPlanPlanTimes` reads the times of one plan.

Their consumers admit work at smaller costs:

- `get-candidate-details.ts` reserves one request per blockout-parent collection, plus the declared schedule-page allowance when history is requested. It then reserves one request per recurring-date collection and one per plan-time collection.
- `get-people-dashboard-person.ts`, `resolveMissingPlanTimes`, slices direct plan IDs by the number of remaining requests. Each ID can cost ten requests.
- `get-person-blockouts.ts` is another caller of the parent collection reader. It must participate in a collection-reader migration rather than receiving a truncated replacement.

Actual accounting prevents sending request 41, but it cannot recover a continuation after an already admitted whole collection fails. The current candidate-details tests mostly count these collection mocks as one request; dashboard-person direct plan-time mocks likewise cost one. They do not exercise pagination through the real service and core client.

There is a separate completeness defect: `PlanningCenterCoreClient.fetchAllWithIncluded` stops at `maxPages` and returns only `{ data, included }`, discarding an outstanding `links.next`. A capped result is indistinguishable from a complete collection and can enter the complete-collection cache. Increasing reservations to ten would reduce budget failures while retaining that defect. Reducing `maxPages` would make missing data more likely.

## Proposed remedy

Introduce explicit page readers for the affected collections. Their typed result includes the page resources and an optional next cursor. Service adapters own endpoint construction and API queries. Validate continuation against the expected account, person or plan, endpoint, selected date, and query; do not accept an arbitrary browser-supplied fetch URL. Keep narrow service dependencies injected into application modules.

Admit pages rather than whole collections. Before each bounded group of reads, use actual requests spent plus reservations for in-flight work. Retain the six-connection ceiling. Reconcile reservations after completion so cache hits leave room for useful work. Retries remain counted by the core client; unexpected repeated transient failures must still fail with the existing typed fault. An exhausted planning allowance returns accumulated results and continuation before admitting another page, rather than deliberately hitting the transport cap and catching that error as success.

Candidate continuation needs enough state to resume all unfinished work:

- Remaining parent-list cursor and relevant recurring parents already encountered.
- Current recurring blockout and its next date-page cursor.
- Blockouts fully checked and found not to cover the selected date.
- Pending rehearsal plan IDs, current plan-time cursors, and accumulated resources or derived history required to assemble the final result.
- Completion state for the requested person and history mode.

Do not rely on the previous invocation's isolate cache to reconstruct progress. A continuation must work with fresh service instances and empty caches. Choose either explicitly validated carried state or an account-scoped durable continuation design; any added KV/D1 operations require reevaluating the non-Planning-Center reserve. Prefer the former if it avoids new bindings and comfortably bounded transport payloads. Carry only relevant resources or derived state, deduplicate shared plan reads, and preserve the existing history and calendar-day transforms.

Availability is complete only after all relevant parent pages and recurring-date pages have been checked, or after a covering occurrence proves that the person is blocked. A covering occurrence can finish availability early. A non-covering date page cannot mark its blockout checked while a next page exists. When schedule history is requested, availability completion alone does not finish the person's history. Preserve blockout-local time-zone comparisons and full selected-plan instants.

Cache page results separately, or publish a complete collection only after its terminal page. Never write a partial collection into the existing complete-result cache. Preserve existing explicit deleted-plan/not-found semantics where warranted; budget, rate-limit, authentication, and network failures must not become empty collections.

## Contract and client implications

`packages/contracts/src/people.ts` and `people-schemas.ts` currently carry only candidate `blockoutProgress`, whose fields are `personId`, `checkedBlockoutIds`, and `blocked`. Extend or replace this with validated progress covering page cursors and unfinished history. Completion must be explicit rather than inferred from the number of records returned.

`apps/web/src/hooks/use-position-candidates.ts`, `fetchCandidateDetails`, currently accepts progress only when a batch finishes someone or changes checked blockouts/blocked state. Advancing a parent/date/plan-time page is valid progress even when neither changes. Update its progress comparison and pass the full continuation through subsequent calls. Keep cancellation and query priority on every invocation.

Dashboard-person currently has no continuation input or output. Its `unresolvedRehearsalTimes` count reports omitted times, but the browser query settles after that response. Add an explicit continuation and make `apps/web/src/hooks/use-people-dashboard-person.ts` follow it to completion. Preserve the existing person-detail output and result transforms; if partial detail is displayed while loading, label its completion state and replace it when the remaining rehearsal dates arrive. A successful complete result must not retain unresolved times merely because the first invocation used its budget.

Any native consumer of these affected contracts must follow the same continuation, or explicitly expose incomplete state. Check generated/native contracts when implementation scope is finalized. Apply current repository preferences to remove obsolete parallel paths after replacing them.

## Acceptance criteria before rollout

1. Convert the diagnostic fixtures into regression tests using real service/core pagination and injected HTTP responses. A fake collection costing one request is insufficient.
2. Follow continuations with a new accounting instance and fresh service caches each time. Every healthy invocation stays within the progressive allowance, and the complete aggregate equals an exhaustive unbudgeted fixture.
3. Cover parent lists across several pages; recurring dates with the only covering occurrence on a late page; non-covering dates across all pages; and collections longer than ten pages. Nobody becomes available early, and outstanding next pages remain resumable.
4. Cover shared plans, times needed from a plan's second page, more plans than fit one invocation, and dashboard-person continuation. Completed history, distinct-day frequency, and actual rehearsal dates must match the exhaustive reference.
5. Verify warm-cache equivalence and account separation. Partial results must never masquerade as complete cached results.
6. Exercise retries, cancellation, and concurrent reservations. Budget/rate-limit/network faults remain typed failures; normal planned deferral produces continuation. Test that advancing only a cursor passes the browser progress guard and that repeated identical continuation fails clearly.
7. Run repository CI/build and rendered verification of candidate availability and person month detail. Capture proof bound to the implementation head and base. Validate any native consumer before claiming end-to-end completion.

The current diagnostic deliberately reports the failure instead of patching production behavior. This design should remain a separate reviewable architectural change until the contracts, server paging, clients, and completeness tests are implemented together.
