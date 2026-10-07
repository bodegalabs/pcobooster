# Mobile People features

People replaces the Expo placeholder with the Swift People feature (`apps/ios/PCOBooster/Features/People` at `5f5eec65`) on the typed product client and TanStack Query. It appears only with the account's `people` flag; the screens use the existing React Native primitives, and matching the Swift visuals is outside scope. Code lives in `apps/mobile/src/features/people`; routes are `/people` and `/people/<person id>?month=YYYY-MM` (`peopleDestinations`, with stable `peopleTestIds`).

## Reads and request budget

- `people.dashboardRoster` loads first and paints from the account's disk cache. The scope picks people in roster order: a team scope up to 160 people loads whole, larger scopes and All teams load 48, and Load more adds 48. Nothing loads more on scroll.
- `people.dashboardActivity` reads 16 people a call, two calls at a time, ordered started calls, then search matches, then the rest. Each call follows `deferredPersonIds`; a call that defers everyone, or a 20th follow-up, fails typed (`ContinuationStalledError`). The merged batch keeps the procedure's schema, so it persists.
- `people.dashboardPerson` follows `continuation` until `null` and fails typed when the cursor does not move. `people.blockouts` lists future blockouts only.
- Reads are keyed `[account scope, procedure tag, ...]` inside the account's own query client, so the demo, the local API, and each person and organization never share data. The chosen scope and view are validated local queries in that same scoped persistent cache; they restore across launches within the cache lifetime and are deleted with a forgotten account.
- Reads run only while the screen is visible and the flag is on (`subscribed`): opening a person, a plan, or another tab cancels calls in flight through their abort signals, and returning resumes them. Each month is its own query, so a late answer never replaces another month. Long-pressing a row warms that person's month in the speculative lane; nothing prefetches on scroll.
- Pull to refresh reloads the roster, then every planned activity call, still two at a time. Retry reloads only failed calls.

## Parity checklist

| Swift behavior | Status |
| --- | --- |
| Tab shown only with the `people` flag | Ported (tab hidden; a deep link shows "People isn't turned on") |
| Scope: Teams I lead (leaders only), All teams, one team grouped by service type, Other teams last | Ported in the header menu; an invalid remembered team falls back to the default |
| Scope saved per account across launches | Ported through the scoped cache and its revoked-storage-lease deletion guard |
| Search by name, team, or role; unloaded matches load after a 400 ms pause, Load more matches | Ported |
| Progressive sample, Load more, coverage line ("Based on 16 of 40 people so far") | Ported |
| Loading meter, "Some schedules failed to load" with Retry, roster error with Retry | Ported |
| Health summary sentence, signals (No reply, Declining, Drifting, Heavy load, Due, Not serving) | Ported; signals judged on the organization's calendar day against each person's team pace |
| Attention cards (waiting, check in, due) | Changed: a Show > Needs attention filter over the same signals, chips on each row |
| Roster sort by name, last served, 90-day serving | Ported in the menu |
| Month view: who serves each day, counts, services before rehearsals | Ported as a day list; the heatmap grid is visual polish and out of scope |
| Health/Month segmented control remembered | Ported as a View menu; the choice is remembered per account |
| Person page: teams and roles, numbers, signals, rotation, blockouts, Open in Planning Center | Ported |
| Month paging keeps the month on screen (dimmed) until the next answers; paints from the list's data first | Ported |
| Commitments split into Coming up and Earlier this month, each opening the plan's Lineup | Ported |
| Blocked-out days in the month, each blockout read on its own Planning Center zone, all-day ranges as entered | Ported as a "Blocked out on" line and per-commitment marks; the striped calendar grid is out of scope |
| Unresolved rehearsal times note | Ported |
| Context menu preview with Show Details, Open in Planning Center, Copy Name | Changed: a long press action sheet with Show Details and Open in Planning Center; Copy Name needs a clipboard module the app does not include |
| iPad inspector beside the dashboard | Out of scope: iPad pushes the person screen like iPhone |
| Swipe between months, haptics, transitions | Out of scope (visual polish) |
| Launch overrides (`-PCOBPeopleScope`, `-PCOBPeopleView`) | Out of scope for the fixture harness |

## Verification

`apps/mobile/src/features/people/*.test.ts` covers scope and sample rules, batch order, search and coverage copy, signals and team health on an org day, blockout ranges in `America/Los_Angeles` across the DST change, month splitting, placeholders, and the reads through the real product client over the controlled fixture transport: request encoding, deferred and stalled continuations, the disk cache round trip, permission faults, offline transport failures, cancellation without stale data, account isolation, and speculative prefetch. Rendered iPhone and iPad acceptance, light and dark appearance, VoiceOver, and large text are recorded separately against the integrated revision. No test sends Planning Center writes.
