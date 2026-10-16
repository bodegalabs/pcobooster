# Agent-friendly repository plan

**Status:** proposal (2026-10-16)  
**Principle:** fix mistakes at the highest enforceable layer. Code and types first, then lint/CI/tests, then prose (`AGENTS.md`, skills), then human review.

**PStack:** `poteto-mode`, `correct`, and `architect` are not installed in this workspace. This plan applies the same ideas manually (see [pstack-codex-pr-trust research](research/pstack-codex-pr-trust.md)): prove on the real surface, sequence verifiable units, bind proof to a revision.

---

## Evidence mined

### Git and authorship

| Signal | Count / note |
| --- | --- |
| Commits with `Co-Authored-By: Cursor Agent` (full history) | **522** |
| Commits with `Co-Authored-By: Claude` (full history) | **8** (many more Opus co-authors use the Anthropic noreply address) |
| Merged PRs whose head branch contains `cursor/` (recent sample) | **3** in the last ~200 merges: [#351](https://github.com/jbolabs/pcobooster/pull/351), [#356](https://github.com/jbolabs/pcobooster/pull/356), [#359](https://github.com/jbolabs/pcobooster/pull/359) |
| Title prefix `Fix` / `Stabilize` / `Guard` / `Harden` (last ~800 commits) | **14** explicit hardening/fix merges; many more fixes land without those prefixes |
| Reverts in recent history | [#200](https://github.com/jbolabs/pcobooster/pull/200) reverted admin full-stack Access ([#195](https://github.com/jbolabs/pcobooster/pull/195)) |

### Thematic commit volume (grep on `git log --grep`, all branches)

| Theme | Commits |
| --- | ---: |
| Time zone / calendar correctness | **12** |
| Speculative / prefetch discipline | **10** |
| D1 / session / DB read amplification | **9** |
| “Empty” data / silent degradation | **12** |
| Request budget / pacing | **7** |
| Marketing replica sync | **3** titled “replica”; more touch the demo under `apps/marketing` |

### Agent fix-up chains (same feature, second PR)

| First attempt | Follow-up | Lesson |
| --- | --- | --- |
| [#351](https://github.com/jbolabs/pcobooster/pull/351) `febe03d` — removed `maskAttributeFn` to fix unstyled replays | [#359](https://github.com/jbolabs/pcobooster/pull/359) `9463012` — selective `ReplayMask` + `data-replay-mask` so replays stay styled **and** person text stays private | Privacy and rrweb styling are coupled; blanket `maskTextSelector: "*"` was the wrong default for support workflows |
| [#322](https://github.com/jbolabs/pcobooster/pull/322) / [#323](https://github.com/jbolabs/pcobooster/pull/323) — rewrite **58** tests, delete **7**, add mechanical lint | Ongoing Jake review notes in [#322](https://github.com/jbolabs/pcobooster/pull/322) body: comparison oracles, golden files, spies on own modules | Tests that “pass when the subject returns `undefined`” survived until CI enforced shape |

### Jake / maintainer feedback (encoded today)

Most recurring review themes already live in `AGENTS.md` (**Learned User Preferences** and **Request Budget**). They trace to shipped fixes, not drive-by prose:

- No `transition-colors` / instant hover states → `local/no-transition-colors` ([`oxlint.config.ts`](../oxlint.config.ts)); early cursor UI PRs [#43](https://github.com/jbolabs/pcobooster/pull/43)–[#53](https://github.com/jbolabs/pcobooster/pull/53).
- HoverCard over Tooltip → preference text only (1 commit mentions Tooltip).
- People detail uses shell breadcrumbs, not in-page back buttons.
- Autosave popovers via `usePersistOnClosePopover`; no success toasts on inline saves.
- Planning Center: never fan out beyond budget; never turn limits into empty data ([#169](https://github.com/jbolabs/pcobooster/pull/169) `42fa89d`, [#170](https://github.com/jbolabs/pcobooster/pull/170) `282dd9f`).
- Speculative work only on intent ([#161](https://github.com/jbolabs/pcobooster/pull/161) `139170f`, [#186](https://github.com/jbolabs/pcobooster/pull/186) `2917777`).
- Org time zone on every congregation date → [`lint/time-zone-formatting.test.ts`](../lint/time-zone-formatting.test.ts); [#257](https://github.com/jbolabs/pcobooster/pull/257) `5f5eec6`, [#260](https://github.com/jbolabs/pcobooster/pull/260) `f2bf3eb`.
- Marketing replica must track product UI → [marketing.md](marketing.md); [#258](https://github.com/jbolabs/pcobooster/pull/258) `46f571e`, [#354](https://github.com/jbolabs/pcobooster/pull/354) `629f5ef`.

Cloud-agent PR bodies sometimes mark proof `n/a` while skipping full `bun run ci` (example: [#351](https://github.com/jbolabs/pcobooster/pull/351) body). That conflicts with [proofed-delivery.md](proofed-delivery.md).

---

## Recurring pitfalls → highest-layer fixes

Ranked by **leverage ÷ effort** (H/M/L). Each row cites real merges or SHAs.

### 1. Planning Center failures become empty UI

| | |
| --- | --- |
| **Evidence** | [#169](https://github.com/jbolabs/pcobooster/pull/169) `42fa89d`; [#170](https://github.com/jbolabs/pcobooster/pull/170) `282dd9f` (40-request cap, progressive cursors); [#283](https://github.com/jbolabs/pcobooster/pull/283); research ledger in [planning-center-rate-limits.md](research/planning-center-rate-limits.md) |
| **Layer** | **Code** — `recoverPlanningCenterFailure` is the only recovery gate; rate/subrequest limits are typed faults that never map to `[]`. |
| **Next step** | Add a **contract test** in `apps/server/src/worker.stack.test.ts` that forces `PlanningCenterRateLimitError` on a progressive procedure and asserts the client receives a continuation/fault, not an empty list. |
| **Effort** | M |
| **Leverage** | H |

### 2. Request budget and speculative fan-out

| | |
| --- | --- |
| **Evidence** | [#161](https://github.com/jbolabs/pcobooster/pull/161) `139170f`; [#186](https://github.com/jbolabs/pcobooster/pull/186) `2917777`; [#266](https://github.com/jbolabs/pcobooster/pull/266)–[#268](https://github.com/jbolabs/pcobooster/pull/268); `PLANNING_CENTER_REQUEST_CAP` / `PROGRESSIVE_REQUEST_BUDGET` in code |
| **Layer** | **Code** — keep heavy screens as small procedures with cursors (pattern in [api-architecture.md](api-architecture.md#progressive-procedures)). |
| **Next step** | **Lint** (static): fail when `apps/web` query functions call `productClient.run` without `callForQuery` or `speculativeQuery` (today `callForQuery` appears in hooks but several `useQuery({ queryFn })` call sites still hand-roll fetch). Prototype: extend [`lint/architecture-boundaries.test.ts`](../lint/architecture-boundaries.test.ts) with an allow-list for auth/accounts queries. |
| **Effort** | M |
| **Leverage** | H |

### 3. Wrong time zone for congregation dates

| | |
| --- | --- |
| **Evidence** | **12** time-zone-themed commits; [#257](https://github.com/jbolabs/pcobooster/pull/257) `5f5eec6`; [`lint/time-zone-formatting.test.ts`](../lint/time-zone-formatting.test.ts) |
| **Layer** | **Static analysis** — already enforced for listed roots. |
| **Next step** | Extend checked roots to `apps/mobile` when the same formatters appear there; require `formatCalendarDateLabel` / `useOrganizationTimeZone` in lint message text. |
| **Effort** | S |
| **Leverage** | H |

### 4. Tests that cannot fail

| | |
| --- | --- |
| **Evidence** | [#322](https://github.com/jbolabs/pcobooster/pull/322) `6882c58` (**58** rewritten, **7** deleted); [#323](https://github.com/jbolabs/pcobooster/pull/323) `6ee2a9c`; [`lint/oxlint-plugin-test-quality.mjs`](../lint/oxlint-plugin-test-quality.mjs); `anti-slop/no-module-mocking` |
| **Layer** | **Static analysis** — partial. |
| **Next step** | **Lint**: flag `it` blocks whose only expectations are `toHaveBeenCalled*` (Jake’s [#322](https://github.com/jbolabs/pcobooster/pull/322) review still lists comparison oracles). **Code**: export golden files only from checked-in fixtures, never from the module under test. |
| **Effort** | M |
| **Leverage** | H |

### 5. UI composition drift (transitions, primitives, density)

| | |
| --- | --- |
| **Evidence** | Cursor-era merges [#43](https://github.com/jbolabs/pcobooster/pull/43)–[#53](https://github.com/jbolabs/pcobooster/pull/53), [#312](https://github.com/jbolabs/pcobooster/pull/312); [`lint/oxlint-plugin-local.mjs`](../lint/oxlint-plugin-local.mjs) (`no-transition-colors`, bare `<button>`, popover padding, backdrop blur) |
| **Layer** | **Static analysis** — strong for listed patterns. |
| **Next step** | Add **`local/no-tooltip`** (or equivalent) to steer agents to HoverCard per `AGENTS.md`; extend icon-margin rule coverage documented in [#312](https://github.com/jbolabs/pcobooster/pull/312). |
| **Effort** | S |
| **Leverage** | M |

### 6. Session replay privacy vs readable replays

| | |
| --- | --- |
| **Evidence** | [#351](https://github.com/jbolabs/pcobooster/pull/351) `febe03d` → [#359](https://github.com/jbolabs/pcobooster/pull/359) `9463012`; `ReplayMask` in `apps/web/src/lib/replay-mask.tsx` |
| **Layer** | **Code** — `ReplayMask` + `data-replay-mask` / `data-replay-block` on avatars. |
| **Next step** | Promote spike on branch [`cursor/spike-replay-mask-lint-9182`](https://github.com/jbolabs/pcobooster/tree/cursor/spike-replay-mask-lint-9182) (`83d55de`): extend heuristic to `aria-label`, `title`, and `AvatarFallback` initials; fail CI on new unmasked person strings. Spike run (Vitest): **0** naive `{person.name}` text nodes outside `ReplayMask` in `apps/web/src/components` today; attribute leaks remain the risk called out in [#359](https://github.com/jbolabs/pcobooster/pull/359). |
| **Effort** | M |
| **Leverage** | H (support + privacy) |

### 7. Marketing product replica falls behind `apps/web`

| | |
| --- | --- |
| **Evidence** | [#258](https://github.com/jbolabs/pcobooster/pull/258) `46f571e`, [#259](https://github.com/jbolabs/pcobooster/pull/259), [#313](https://github.com/jbolabs/pcobooster/pull/313), [#354](https://github.com/jbolabs/pcobooster/pull/354); [marketing.md](marketing.md) (“When the product's interface changes, update the replica”) |
| **Layer** | **CI test** — no mechanical gate today. |
| **Next step** | Add `lint/marketing-replica-parity.test.ts`: when specific product route components change (glob allow-list), require a matching change under `apps/marketing/src/components/product-demo/` or an explicit `REPLICA_EXEMPT` comment with reason. Start with plan views and phone menu exports shared via `@pcobooster/ui`. |
| **Effort** | M |
| **Leverage** | M |

### 8. Per-request D1 / auth read amplification

| | |
| --- | --- |
| **Evidence** | [#340](https://github.com/jbolabs/pcobooster/pull/340) `e71d8d6` (~7.8 D1 statements → single account read + token reuse) |
| **Layer** | **Code** — session/account accessors on `ServerDependencies`. |
| **Next step** | **Type boundary**: expose `RequestAuthSnapshot` from one middleware hop; make duplicate `getSession` calls a compile error via Effect `RequestContext` tag. Optional **Vitest** counter in worker stack test. |
| **Effort** | L |
| **Leverage** | M (launch-scale) |

### 9. Import and transport boundaries

| | |
| --- | --- |
| **Evidence** | [`lint/architecture-boundaries.test.ts`](../lint/architecture-boundaries.test.ts) (no `@pcobooster/api` in web, no module-scope caches in modules/, Effect recovery allow-list) |
| **Layer** | **Static analysis** — already high leverage. |
| **Next step** | Document in one table inside the lint file header which agent mistakes each block prevents; add admin-app symmetry checks when `apps/admin` components import `packages/api`. |
| **Effort** | S |
| **Leverage** | M |

### 10. “Verified” PRs without revision-bound proof

| | |
| --- | --- |
| **Evidence** | [proofed-delivery.md](proofed-delivery.md); [verify-pcobooster skill](../.agents/skills/verify-pcobooster/SKILL.md); agent PR [#351](https://github.com/jbolabs/pcobooster/pull/351) checklist gaps |
| **Layer** | **CI / process** |
| **Next step** | For paths classified **medium+** in `scripts/proof` (or equivalent), add a **non-blocking** CI job that comments when `bun run proof -- verify` is missing on PRs touching `apps/web` or `packages/api`. Keep merge gate on `ci` only until flake rate is known. |
| **Effort** | M |
| **Leverage** | M |

### 11. Native / mobile startup and flake

| | |
| --- | --- |
| **Evidence** | [#296](https://github.com/jbolabs/pcobooster/pull/296) `866e1f3` (Hermes route discovery); [#356](https://github.com/jbolabs/pcobooster/pull/356) `12e3a6b` (bearer token test flake) |
| **Layer** | **Tests** — freeze clocks and crypto in native tests; avoid environment-dependent signatures. |
| **Next step** | Extend [`lint/test-time-zone.test.ts`](../lint/test-time-zone.test.ts) pattern to flag `Date.now()` in tests without `vi.setSystemTime`. |
| **Effort** | S |
| **Leverage** | M |

### 12. Prose-only guidance that should stay rare

| | |
| --- | --- |
| **Evidence** | `AGENTS.md` is long; many bullets duplicate enforced lint ([`AGENTS.md`](../AGENTS.md) ↔ `lint/*`) |
| **Layer** | **Prose** — trim as rules land. |
| **Next step** | When a pitfall gets a lint or stack test, delete the duplicate bullet from `AGENTS.md` and link to the enforcing file (one line). |
| **Effort** | S |
| **Leverage** | L (maintainability) |

---

## Verification skill (existing + gaps)

The repo already ships **[verify-pcobooster](../.agents/skills/verify-pcobooster/SKILL.md)** with a [feature map](../.agents/skills/verify-pcobooster/references/feature-map.md) and ties to `bun run proof`. Gaps for cloud agents:

| Gap | Proposed addition |
| --- | --- |
| No **Doctor** step | Add `## Doctor` to the skill: `bun run ci` secretless per [codex-cloud.md](codex-cloud.md); `bun run dev` needs cloud OAuth trio; missing creds → `BLOCKED`, not “product broken”. |
| Mutation flows blocked | Keep “provider mutations = tests only” but link exact Vitest commands per module (Assign writes, plan items) from `packages/api` stack tests. |
| Marketing-only diffs | Already documented; add explicit “do not run full `bun run dev` when only `apps/marketing` changed”. |

No new verify skill file is required unless we split mobile (`verify-pcobooster-ios`) after Expo flows stabilize.

---

## Prototype branches

| Branch | SHA | Purpose |
| --- | --- | --- |
| [`cursor/spike-replay-mask-lint-9182`](https://github.com/jbolabs/pcobooster/tree/cursor/spike-replay-mask-lint-9182) | `83d55de` | Survey + future CI for `ReplayMask` coverage |

---

## Implementation order

1. **Quick wins (S, high leverage):** time-zone lint → mobile roots; Tooltip ban lint; trim `AGENTS.md` duplicates as rules exist.
2. **Agent mistake killers (M):** queryFn `callForQuery` lint; replay mask CI from spike; marketing replica parity lint.
3. **Scale / trust (M–L):** worker stack tests for rate-limit faults; `RequestAuthSnapshot` typing; optional proof CI commenter.

---

## What not to do

- Do not add long agent checklists without an enforcing test or lint.
- Do not raise `PLANNING_CENTER_REQUEST_CAP` to “fix” budget errors ([request budget](research/planning-center-rate-limits.md)).
- Do not treat presentation mode or marketing demo as a Planning Center mutation sandbox ([codex-cloud.md](codex-cloud.md), [proofed-delivery.md](proofed-delivery.md)).

---

## References

- Internal: [API architecture](api-architecture.md), [CI/CD](ci-cd.md), [PStack / Codex trust research](research/pstack-codex-pr-trust.md)
- External: [Cursor PStack `poteto-mode`](https://github.com/cursor/plugins/tree/main/pstack/skills/poteto-mode/SKILL.md) (not installed here)
