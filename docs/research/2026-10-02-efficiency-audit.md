# Request-efficiency audit

Scope: browser query and prefetch paths, Planning Center feature modules and service caches, and the native-client source snapshot. This is a source and synthetic-test audit following the login CPU incident, not a production traffic measurement. The first four performance layers remain separately reviewable in PRs #260, #261, #262, and #264.

## Verified changes in this follow-up

| Finding | Change | Repeatable evidence |
| --- | --- | --- |
| Candidate details expand recurring dates even when a one-time blockout already proves unavailability. | Check the existing blockout predicate before admitting recurring expansion. Keep schedule/history reads. | Two candidates with 90 recurring parents previously used 36 requests; now use 3, with identical blocked answers. History-enabled fixture still reads rehearsal times. `get-candidate-details.test.ts`. |
| A hover/focus ends after its dwell but before the speculative lane opens; its queued work still starts. | Cancel the matching waiting turn as well as the pending dwell. | Held-lane regression leaves the target before releasing the queue and sends no prefetch. Unrelated target leave and already-started work remain covered. `intent-prefetch.test.ts`. |
| Candidate prefetch starts every detail batch concurrently although visible loading is capped at two. | Apply the same two-batch concurrency limit to prefetch. | Held detail promises for 80 candidates previously started five batches together. Regression must enforce at most two and eventual completion of all batches. |
| Candidate queries remain observed outside Assign when the route retains a selected slot. | Observe candidate queries only while Assign is visible, preserving selection and cache keys. | [Draft PR #268](https://github.com/bodegalabs/pcobooster/pull/268): read-only localhost network inspection showed candidate reads on Assign and no new people requests after returning to Plan with the selection retained. |
| Adding roster-only positions repeatedly sorts every filled position. | Append people in roster order and sort each filled position once after assembly. | Mixed known/roster-only regression covers counts, confirmed-before-pending order, alphabetic order, and stable equal-name ties. Synthetic measurements below; provider request counts are unchanged. |

The savings above are fixture-specific. These changes do not alter Workers limits or establish that production login failures are resolved. Per-procedure budgets and rate pacing remain authoritative.

## Remaining candidates

| Priority | Candidate | Evidence and next verification |
| --- | --- | --- |
| High | Direct plan-time and blockout reads are budgeted as one request but can page. | [Draft PR #269](https://github.com/bodegalabs/pcobooster/pull/269) adds a network-free reproducer and [continuation design](candidate-pagination-budget.md). Both real-service synthetic scenarios exhaust the 40-request cap without returning a batch. Capped reads also discard outstanding next-page links. Pagination and completeness remain unresolved; the draft changes no production behavior. |
| Deferred | Plan-item normalization repeatedly scans included resources. | Full normalization/index construction benchmarks showed negligible small-response savings: 50 items with 200 included resources saved about 0.016 ms; a 25-item fixture was slower with an index. Duplicate/type/missing-layout/relationship/order parity passed. Large all-song stress responses improved, but these timings do not justify another layer without production evidence. |
| Medium | Candidate identity/preferences repeatedly scan included people. | `people/transforms.ts` repeats resource scans for each assignment. Verify first assignment and malformed-person behavior before sharing an index. |
| Medium | Window time selection still scans parsed times per plan. | PR #262 removes repeated validation, but not repeated matching. An index must preserve included order and explicit relationship precedence. |
| Medium | Person-page unsent assignments repeatedly search included plans and teams. | Index the collection once only if a realistic fixture shows useful savings and unchanged output. |

## Native-client branch findings

The remote `jake/ios-app` branch was freshly fetched for this audit at `1ab93118eee1ac36c10c7f9b819388652fd1152d`. It is separate from this main-based stack; these findings are source verified, not device request-count measurements.

- The audited snapshot's `PeopleDashboardModel.disappear()` hid only the roster observer, while completion admitted more batches without checking visibility. Draft #270 addresses new batch admission and tests leaving People mid-batch; already-running continuations still finish.
- The audited snapshot's `ServicesHomeModel` reactivated every retained plan/recent state, including deselected service types and the hidden date window. Draft #270 limits active observations to the selected service types and visible window, with lifecycle regressions.
- `QueryState` defaults to visible and `QueryClient.query()` immediately signals observer appearance. Hidden roots could start requests if SwiftUI constructs them; whether the actual root tabs are eagerly built still needs simulator/device evidence.
- Native invalidation discards the tracked in-flight task before forced refetch but does not cancel that task. The old response is ignored while its network work can continue. Preserve post-write freshness when testing cancellation or coalescing.
- Native account queries already share same-key tasks, RPC scheduling propagates speculative priority, and plan segments instantiate only the selected segment. Automatic adjacent-plan and plan warm-up reads are speculative; they are not evidence of an interactive-priority defect.

Remaining native verification includes rendered tab/navigation lifecycle request counts, foreground behavior while a screen is covered, and global query invalidation during in-flight reads. Do not transplant native files into this API/browser stack.

[Draft PR #270](https://github.com/bodegalabs/pcobooster/pull/270) now pauses admission of new People batches while hidden and activates Services reads only for the selected service types and visible window. Existing People continuations finish while hidden; the fixture sends four requests for 32 people, then resumes the remaining batch on return for six total requests and 48 people. Fresh returns reuse cache; stale and invalidated returns reload. All 503 Swift tests and simulator compilation passed, with independent lifecycle/cache checks. Rendered simulator and real-device verification remain outstanding. This draft stays on the separate iOS branch; it does not establish that SwiftUI eagerly creates hidden tabs or fix native forced-refetch duplication.

## Final bounded CPU check

`applyPlanTeamMemberSummary` previously sorted every filled slot after each roster-only row was appended. Deferring the unchanged stable comparator until all positions are assembled preserves insertion order for equal names and statuses. The regression checks distinct plan-person IDs with equal display names in both known and roster-only positions, plus declined exclusion and fill counts.

Synthetic Bun measurements compare the original extracted assembly functions with the sort-once version, including map cloning. Each fixture uses five teams, confirmed/pending people, stable name ties, and declined/missing-team rows. Values are median elapsed milliseconds, not production Worker CPU.

| Roster rows | Known / roster-only positions | Filled-list sorts before / after | Elapsed before / after |
| --- | --- | --- | --- |
| 38 | 10 / 2 | 79 / 12 | 0.0207 / 0.0162 ms |
| 122 | 20 / 10 | 1,040 / 30 | 0.132 / 0.045 ms |
| 322 | 50 / 30 | 7,910 / 80 | 0.691 / 0.109 ms |
| 752 | 50 / 100 | 50,300 / 150 | 5.367 / 0.235 ms |

Output parity passed for groups, metadata, counts, alphabetical/status ordering, and stable ties. A fixture without roster-only positions showed no meaningful benefit. This removes an accidental repeated whole-map operation; normal small-roster savings are modest. Further CPU microoptimizations should wait for rollout measurements.

## Constraints checked

- Service-level caches already cover people, blockouts, schedules, plan ranges, catalog lists, and plan times. Do not replace request-scoped in-flight coalescing with global promises: workerd binds I/O to the initiating request, and cancellation can strand other requests.
- Shared read caches are credential scoped. Permission/access reads must remain authoritative; broad caching is not a safe shortcut.
- Other calendar label and wall-time formatter helpers already reuse formatters. No additional formatter changes were justified by this pass.
- Hover prefetch stays speculative until observed. These changes bound or remove optional work; they do not disable rate pacing or increase request caps.

## Rollout measurement

After the reviewed stack ships, correlate login request IDs with per-procedure request counts, CPU, cancellations, and rate-limit logs. Compare comparable screens and roster sizes. Synthetic elapsed times and reduced call counts alone do not prove production Worker CPU savings.
