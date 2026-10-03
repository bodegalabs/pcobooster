# Request-efficiency audit

Scope: browser query and prefetch paths, Planning Center feature modules and service caches, and the native-client source snapshot. This is a source and synthetic-test audit following the login CPU incident, not a production traffic measurement. The first four performance layers remain separately reviewable in PRs #260, #261, #262, and #264.

## Verified changes in this follow-up

| Finding | Change | Repeatable evidence |
| --- | --- | --- |
| Candidate details expand recurring dates even when a one-time blockout already proves unavailability. | Check the existing blockout predicate before admitting recurring expansion. Keep schedule/history reads. | Two candidates with 90 recurring parents previously used 36 requests; now use 3, with identical blocked answers. History-enabled fixture still reads rehearsal times. `get-candidate-details.test.ts`. |
| A hover/focus ends after its dwell but before the speculative lane opens; its queued work still starts. | Cancel the matching waiting turn as well as the pending dwell. | Held-lane regression leaves the target before releasing the queue and sends no prefetch. Unrelated target leave and already-started work remain covered. `intent-prefetch.test.ts`. |
| Candidate prefetch starts every detail batch concurrently although visible loading is capped at two. | Apply the same two-batch concurrency limit to prefetch. | Held detail promises for 80 candidates previously started five batches together. Regression must enforce at most two and eventual completion of all batches. |

The savings above are fixture-specific. These changes do not alter Workers limits or establish that production login failures are resolved. Per-procedure budgets and rate pacing remain authoritative.

## Remaining candidates

| Priority | Candidate | Evidence and next verification |
| --- | --- | --- |
| High | Hidden candidate loading after switching away from Assign. | `usePlanWorkspaceData` builds a candidate slot without checking `routeIds.view`; mobile tabs retain the selected slot in search. Test Assign-to-Plan and direct Plan URLs with a selected slot, then verify no hidden candidate/history/detail calls and cached return to Assign. |
| High | Direct plan-time reads are budgeted as one request but can page. | `getPlanPlanTimes` permits ten pages while candidate-details and dashboard-person admission reserve one per plan. Reproduce a plan with more than 100 times before changing request accounting; retain continuation and no-empty-fallback rules. |
| Medium | Plan-item normalization repeatedly scans included resources. | `normalizePlanItem` performs four first-match lookups per item. Benchmark a resource index per response and cover duplicate IDs, type identity, missing layouts, and ordering. |
| Medium | Candidate identity/preferences repeatedly scan included people. | `people/transforms.ts` repeats resource scans for each assignment. Verify first assignment and malformed-person behavior before sharing an index. |
| Medium | Window time selection still scans parsed times per plan. | PR #262 removes repeated validation, but not repeated matching. An index must preserve included order and explicit relationship precedence. |
| Medium | Person-page unsent assignments repeatedly search included plans and teams. | Index the collection once only if a realistic fixture shows useful savings and unchanged output. |

## Native-client branch findings

The remote `jake/ios-app` branch was freshly fetched for this audit at `1ab93118eee1ac36c10c7f9b819388652fd1152d`. It is separate from this main-based stack; these findings are source verified, not device request-count measurements.

- `PeopleDashboardModel.disappear()` hides only the roster observer. Unstructured batch tasks continue, and completion calls `pump()` without checking visibility. Gate pumping on visibility and test leaving People mid-batch, including continuations.
- `ServicesHomeModel` retains created query states and reactivates every retained plan/recent state on appearance, including deselected service types and the hidden date window. Test only selected service types/window are observed.
- `QueryState` defaults to visible and `QueryClient.query()` immediately signals observer appearance. Hidden roots could start requests if SwiftUI constructs them; whether the actual root tabs are eagerly built still needs simulator/device evidence.
- Native invalidation discards the tracked in-flight task before forced refetch but does not cancel that task. The old response is ignored while its network work can continue. Preserve post-write freshness when testing cancellation or coalescing.
- Native account queries already share same-key tasks, RPC scheduling propagates speculative priority, and plan segments instantiate only the selected segment. Automatic adjacent-plan and plan warm-up reads are speculative; they are not evidence of an interactive-priority defect.

The next native step is a focused lifecycle/request-counter regression on that branch, with People visibility and selected Services state as the first targets. Do not transplant native files into this API/browser stack.

## Constraints checked

- Service-level caches already cover people, blockouts, schedules, plan ranges, catalog lists, and plan times. Do not replace request-scoped in-flight coalescing with global promises: workerd binds I/O to the initiating request, and cancellation can strand other requests.
- Shared read caches are credential scoped. Permission/access reads must remain authoritative; broad caching is not a safe shortcut.
- Other calendar label and wall-time formatter helpers already reuse formatters. No additional formatter changes were justified by this pass.
- Hover prefetch stays speculative until observed. These changes bound or remove optional work; they do not disable rate pacing or increase request caps.

## Rollout measurement

After the reviewed stack ships, correlate login request IDs with per-procedure request counts, CPU, cancellations, and rate-limit logs. Compare comparable screens and roster sizes. Synthetic elapsed times and reduced call counts alone do not prove production Worker CPU savings.
