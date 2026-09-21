# PStack principles for trustworthy Codex software production

Research snapshot: 2026-09-21

## Recommendation

Do not port PStack as one large prompt and do not treat an agent's own summary as proof. Port its trust protocol into this repository as a small set of repo-owned Codex skills, custom verifier agents, and deterministic proof tooling.

The target loop should be:

1. One owner builds a narrow change in an isolated worktree.
2. The owner proves the change on the real surface and opens a reviewable PR with a receipt tied to the exact head SHA.
3. A different agent, in a clean context and preferably on a different model, distrusts the PR body, reruns the relevant gates, and exercises the load-bearing behavior.
4. The verifier posts `PASS`, `PASS+NOTES`, `FAIL`, or `BLOCKED`, with artifacts, against that SHA.
5. Any material push invalidates the verdict. The new head is reverified before merge.
6. GitHub branch rules remain the non-negotiable floor. Agent review and visual proof add confidence; they do not replace CI, branch protection, or a human gate for high-risk changes.

Start with proof-producing PRs and human merges. Earn broader autonomy later from observed false-positive, escape, and flake rates.

## What the names refer to

- **Poteto** is Lauren Tan (`@poteto`), the author credited in the official Cursor plugin manifest.
- **PStack** is the `pstack` plugin in Cursor's public plugin repository. The inspected version is `0.15.2` at Cursor repository commit [`640ea3a`](https://github.com/cursor/plugins/tree/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack).
- **Poteto Mode** is PStack's main routing skill. It matches a request to a playbook, applies a set of engineering principles, delegates selected work, and defines the verification and PR handoff. It is not a separate product. [Official skill](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/poteto-mode/SKILL.md)
- **Cursor Team Kit** is a companion Cursor plugin. PStack explicitly reaches into it for UI/CLI control, diff cleanup, verification, and PR workflows. [Official plugin README](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/cursor-team-kit/README.md)
- The broader family also relies on Cursor platform primitives: skills, isolated/background subagents, `/loop`, Cloud Agents, computer use, Automations, and Bugbot. Cursor documents Cloud Agent screenshots, videos, and logs as PR artifacts; direct embedding in GitHub is opt-in and uses publicly reachable unguessable URLs. [Cursor Cloud Agent capabilities](https://cursor.com/docs/cloud-agent/capabilities)

There is already a community Codex port, [`michael-denyer/pstack-claude`](https://github.com/michael-denyer/pstack-claude). At inspected commit [`2fe2002`](https://github.com/michael-denyer/pstack-claude/tree/2fe2002190bff9257d3e27f84ba6818f2cfd7e32), it ships a Codex plugin manifest, a `SessionStart` routing hook, generated shortcuts, a Cursor/Claude-to-Codex tool map, and a meaningful test suite. It is useful prior art, but it is not the Cursor-maintained source. Its PStack sync pin is `e8d856f` from 2026-09-07, while the current official tree has six later PStack commits, including changes to evidence labeling and model-budget configuration. [Port sync pin](https://github.com/michael-denyer/pstack-claude/blob/2fe2002190bff9257d3e27f84ba6818f2cfd7e32/tools/upstream.json), [official commits after the pin](https://github.com/cursor/plugins/commits/main/pstack)

The community port is therefore a good reference or optional personal tool, not the foundation of a team trust boundary. The repository should own the few rules that determine whether a PR is safe to review or merge.

## The mechanisms that actually create trust

### 1. Real-surface verification

PStack's `Prove It Works` principle rejects proxies such as compilation, cached screenshots, and delegate self-reports. It asks the agent to run the feature, exercise the full path, inspect the actual result, and retain a deterministic script when possible. [Official principle](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/principle-prove-it-works/SKILL.md)

Its verification-skill generator turns that into a project-specific contract with:

- `Launch`: exact startup and readiness checks.
- `Doctor`: a read-only check that the instance is worth driving.
- `Drive`: stable selectors or commands for the real user surface.
- `Evidence`: action plus result, including side-effect checks.
- `Cleanup`: remove only what the run created while preserving proof.
- A feature map that records how to reach and prove each user-facing behavior.

The generated skill must execute one mapped feature end to end before it is considered deliverable. [Official `create-verification-skill`](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/create-verification-skill/SKILL.md)

This is more important than the orchestration layer. Parallel agents merely produce more untrusted output unless they share a reliable way to observe the product.

### 2. Owner proof plus independent verification

PStack separates authorship from the merge verdict. Its shipping playbook requires one independent verifier per PR, exercising the actual surface against parent and head. CI green and an approving review bot are explicitly inputs, not a sufficient verdict. [Official shipping playbook](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/poteto-mode/playbooks/shipping.md)

This corrects a common misuse of “self-checking.” The author should self-check, but the merge decision should not depend only on the same model, context, assumptions, and observation method that wrote the change.

### 3. Verdicts bound to immutable code

PStack records the head SHA, base SHA, and stable `git patch-id` for a verifier verdict. A changed patch invalidates the verdict; a rewritten but patch-identical head still requires fresh mergeability and CI. [Official shipping playbook](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/poteto-mode/playbooks/shipping.md)

This is the core invariant for scalable review: “verified” is not a property of a PR number. It is a property of a specific base-to-head patch plus the environment in which it was exercised.

### 4. Evidence in the PR, detail outside the prose

PStack treats a PR body as a briefing: why, scope, meaningful tradeoffs, blast radius, and real verification. It says to attach screenshots or video when they prove a claim, while moving verbose lane logs into linked artifacts. [Official opening-a-PR playbook](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/poteto-mode/playbooks/opening-a-pr.md)

GitHub now supports this directly. GitHub CLI `v2.99.0+` can attach images or videos to PR creation, edits, and comments with repeatable `--attach` flags; local Markdown references are rewritten to uploaded asset URLs. [GitHub attachment documentation](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli), [release announcement](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments/)

The local machine currently has `gh 2.87.2`, which predates `--attach`. Upgrading `gh` is a concrete prerequisite for an agent-native screenshot/video path.

### 5. Narrow, ordered, verifiable units

PStack asks agents to verify each small unit before advancing and to arrange commits and PRs so their sequence demonstrates the change: baseline before treatment, failing test before fix, scaffold before feature. [Official principle](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/principle-sequence-verifiable-units/SKILL.md)

Its larger-scale playbooks add one writer per branch, one topology owner for a stack, parallel owners only on disjoint work, and re-verification after restacks. [Official autopilot-stack playbook](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/poteto-mode/playbooks/autopilot-stack.md)

### 6. Adversarial review with lead judgment

`interrogate` sends the same intent, diff, and rubric to multiple reviewers, then has a lead reviewer deduplicate, trace findings, weigh consensus, and explicitly dismiss noise. It does not auto-apply reviewer suggestions. [Official `interrogate` skill](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/interrogate/SKILL.md), [lead-judgment framework](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/interrogate/references/lead-judgment.md)

The useful principle is independent challenge, not model voting. Agreement is high-signal; one reviewer can still find a real security or correctness issue; several reviewers can also repeat the same bad premise. Runtime evidence remains the tiebreaker.

### 7. Durable receipts and explicit failure handling

For unattended work, PStack keeps append-only decision and verification records with evidence pointers rather than prose-only status. Its orchestration playbook treats completions as queue events, measures liveness through external side effects such as commits and PR updates, bounds retries by failure mode, replaces stuck workers, and keeps one writer per durable state file. [Official `show-me-your-work`](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/show-me-your-work/SKILL.md), [official orchestration playbook](https://github.com/cursor/plugins/blob/640ea3abfbdef74aad432b58d8586e4bf645f42d/pstack/skills/poteto-mode/playbooks/orchestrate.md)

That makes failure visible instead of allowing “agent said done” to become state.

## What Codex can support today

The needed primitives exist, but they should be assembled explicitly:

- Codex supports repo-scoped skills, installable plugins, and trusted lifecycle hooks. A plugin can combine skills, an MCP server, optional UI, and hooks. [Official OpenAI plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- Codex supports parallel subagents and repo-local custom agent definitions with separate models, reasoning levels, sandbox modes, MCP tools, and instructions. OpenAI's own examples include a read-only PR explorer/reviewer split and a browser debugger that captures screenshots, console output, and network evidence. [Official OpenAI subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- The Codex desktop app supports isolated Git worktrees for parallel tasks. [Official OpenAI worktree documentation](https://learn.chatgpt.com/docs/environments/git-worktrees)
- Codex Cloud can review GitHub PRs automatically or when mentioned with `@codex review`, follows applicable `AGENTS.md` review rules, and intentionally focuses its posted review on high-priority findings. OpenAI explicitly says those rules do not replace tests, branch protection, or required approvals. [Official OpenAI GitHub review documentation](https://learn.chatgpt.com/docs/third-party/github)
- GitHub CLI supplies the missing media transport once upgraded: screenshots and videos can be uploaded directly to PR descriptions or comments. [GitHub attachment documentation](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli)

What is not established as a native Codex guarantee is a Cursor-style Cloud Agent artifact service that automatically records a browser walkthrough and injects it into every PR. For this plan, browser control and artifact upload should therefore be separate, observable steps owned by repository skills and GitHub CLI.

## Current repository baseline and gaps

The foundation is stronger than a typical repository:

- `main` has an active ruleset with no bypass actors, squash-only linear history, strict latest-base checks, and required `verify` plus `Vercel` checks. It currently requires zero approving reviews and does not require thread resolution. [Live ruleset](https://api.github.com/repos/jakebodea/worship-admin/rulesets/13589390)
- `verify` runs strict lint, typecheck, tests, and dependency review. Vercel supplies a production-shaped preview from the same commit. [CI documentation](../ci-cd.md), [workflow](../../.github/workflows/ci.yml)
- The standard local gates are `bun run ci` and `bun run build`. [Package scripts](../../package.json)
- The repo has one project skill, [`check-pc`](../../.agents/skills/check-pc/SKILL.md), but no general change-owner, PR verifier, or product UI verification skill.

The trust gaps are:

1. **No repeatable browser/E2E harness.** The repository has Vitest coverage but no Playwright/Cypress dependency, no user-flow map, and no CI-owned runtime proof.
2. **No independent per-PR verdict.** Recent PR bodies include useful verification claims, but those claims are not consistently backed by an independent verifier comment tied to the current head.
3. **No media upload path on this machine.** The installed GitHub CLI predates `--attach`.
4. **No safe autonomous product sandbox.** `bun run dev:present` anonymizes Planning Center people, but it still uses authenticated, real Planning Center data. The README says the signed-in account and organization remain visible and that presentation mode does not change authentication or grant API access. The marketing guide also says presentation mode does not mask every organization or plan label. It is a privacy aid for a supervised demo, not isolated synthetic data and not a structural write blockade. [README](../../README.md), [marketing screenshot guidance](../marketing.md), [environment contract](../environment.md)
5. **No trusted machine gate for “proof attached.”** A schema-valid receipt written by the same authoring agent would prove completeness, not truth. A required proof check becomes meaningful only when a trusted workflow or service reruns the evidence or verifies a separately authenticated verifier verdict.

## Proposed Codex architecture

Keep the repo-specific trust layer small and composable.

```text
AGENTS.md
  routes non-trivial changes into a repo skill
        |
        v
.agents/skills/build-change/
  classify -> understand -> implement -> self-proof -> open/update PR
        |
        +------------------------------+
        |                              |
        v                              v
.agents/skills/verify-pr/       .agents/skills/publish-proof/
  clean worktree                 PR receipt + gh --attach
  base/head pin                  no behavioral edits
  diff review
  matching-surface run
  PASS/FAIL/BLOCKED
        |
        v
GitHub required checks + independent verdict + risk-tier human gate
```

### Repo-owned skills

#### `build-change`

This is the thin Poteto Mode equivalent, not a copy of all 23 playbooks.

- Classify the work as investigation, bug, feature, refactor, performance, or PR maintenance.
- Name the behavior and data shape before coding.
- Reproduce bugs before editing.
- Split independent write scopes into separate worktrees; keep one writer per branch.
- Run `bun run ci` and `bun run build` before declaring the owner pass.
- For user-visible work, invoke the product verifier on the matching surface.
- Open or update a draft PR early enough to obtain a durable URL and Vercel preview; mark it ready only after owner proof is posted. This intentionally differs from PStack's “ready, never draft” rule because an explicit unproven state is useful in this repository.
- Never merge unless the user explicitly delegates landing and the current risk tier allows it.

#### `verify-pr`

This must run in a new agent context and a clean worktree. Default it to read-only application code; it may create temporary proof artifacts.

1. Fetch the PR base and exact head.
2. Record base SHA, head SHA, and stable patch ID.
3. State the intended behavior as falsifiable claims.
4. Inspect the diff and classify risk.
5. Rerun the relevant gates rather than trusting the PR body.
6. Exercise the load-bearing path on the same surface. Inspect the resulting screenshot, response, database state, or log; producing a file is not inspecting it.
7. Return exactly one of `PASS`, `PASS+NOTES`, `FAIL`, or `BLOCKED`.
8. Post a PR comment beginning `Proof-For: <head-sha>` and include the evidence pointers.
9. If the head changes, treat the prior verdict as stale.

Use a different model family from the author when available. If not, vary reasoning effort and disclose that model diversity was unavailable.

#### `publish-proof`

Own PR formatting and transport, not verification judgment.

- Upgrade GitHub CLI to `v2.99.0+` first.
- Keep the PR body short: why, scope, blast radius, verification, known gaps.
- Attach media only when it proves a visual or interaction claim.
- For a bug, prefer baseline and treatment captured by the same procedure.
- For a feature, show the action and resulting state; a static final screen alone is weak proof.
- Link CI runs for logs. Use GitHub Actions artifacts for large traces only with an explicit retention expectation.
- Do not commit routine screenshots or videos to the source tree.
- Never upload secrets, tokens, private Planning Center data, organization names, people, plan notes, network payloads, or heap captures without an explicit privacy review.

#### `babysit-pr`

- Watch the complete PR check set, not only GitHub Actions.
- Handle conflicts, then real review findings, then CI.
- Retry an apparent infrastructure flake once. An identical second failure becomes a diagnosis, not another retry.
- Re-read the PR after every push.
- Stop at merge-ready unless landing was explicitly delegated.

### Custom Codex agents

Add narrow repo-local definitions under `.codex/agents/`:

- `pr_explorer`: read-only, fast, maps affected paths and blast radius.
- `pr_reviewer`: read-only, high reasoning, checks correctness, security, regressions, and missing tests.
- `ui_verifier`: browser tooling plus temporary artifact write access, no application-code edits.
- `implementation_owner`: workspace write access, one branch/worktree, cannot issue the final verdict.

OpenAI documents this pattern directly: specialized subagents can use distinct models, sandboxes, MCP servers, and instructions, and its browser-debugger example captures screenshots, console output, and network evidence without editing code. [Official OpenAI subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents)

### Proof receipt

Use one compact, stable shape in a PR comment:

```text
Proof-For: <head SHA>
Base: <base SHA>
Patch-ID: <stable patch id>
Risk: docs | internal | backend-behavior | ui | external-write | security
Claims:
- <falsifiable behavior>
Checks:
- <exact command>: PASS | FAIL
Runtime:
- <surface and steps>: PASS | FAIL | BLOCKED
Artifacts:
- <screenshot/video/check-run URL and what it proves>
Verifier: <agent/model>
Verdict: PASS | PASS+NOTES | FAIL | BLOCKED
Known gaps:
- <gap or none>
```

The receipt is a review aid in phase one, not a required status check. Later, a GitHub App or trusted workflow can turn the independently produced verdict into a check run.

## Verification tiers

Do not demand screenshots from nonvisual changes. Match proof cost to risk.

| Tier | Examples | Required proof | Merge policy at rollout start |
| --- | --- | --- | --- |
| 0 | Docs, comments, inert copy | Diff review, formatting/checks | Human click |
| 1 | Pure rules, transforms, refactors | Focused tests, full `verify`, independent diff review | Human click |
| 2 | API/read behavior, cache behavior | Tier 1 plus real request/response or state receipt | Human click |
| 3 | UI and interaction | Tier 1 plus same-surface browser flow, console/network check, screenshot or short video | Human click |
| 4 | Auth, permissions, migrations, external writes, secrets, production | Independent verifier, explicit rollback/cleanup, security review, human approval | Never automatic initially |

Codex's GitHub review can be enabled for every PR as a separate diff-review lane, but it should not be mistaken for Tier 2-4 runtime proof. OpenAI explicitly positions its review alongside tests and branch protection. [Official OpenAI GitHub review documentation](https://learn.chatgpt.com/docs/third-party/github)

## The safe product harness is the first real project

Do not point autonomous UI agents at the current presentation mode for write-path verification.

Build a distinct verification environment with structural safety:

- A deterministic synthetic Planning Center adapter selected only in local/test verification.
- A synthetic organization, plans, people, schedules, and edge cases checked into fixtures or generated from a seed.
- No network path to Planning Center mutation endpoints in verification mode.
- An isolated database/schema or disposable database per run.
- Idempotent reset and teardown.
- Stable accessibility selectors for key flows.
- Browser scenarios for the top user journeys, with console errors and failed requests treated as failures.
- A privacy scanner or explicit artifact review before upload.

Presentation mode can remain the supervised demo/privacy surface. Verification mode should be a deterministic safety boundary.

Begin with three to five mapped flows, not broad visual coverage:

1. Load a plan and its lineup.
2. Inspect a person's availability and scheduling context.
3. Reorder lineup columns/items and observe persisted state.
4. Exercise one schedule mutation entirely against the synthetic adapter.
5. Confirm public marketing routes and protected product/API routes retain the intended access policy.

Once these are stable locally, add them as a separate CI check. Do not put a flaky browser suite into the existing fail-fast `verify` job until it has a measured reliability record.

## Rollout

### Phase 0: establish the receipt

- Upgrade `gh` to `v2.99.0+` and confirm `gh pr create --help` shows `--attach`.
- Add the risk tiers and proof receipt to a short agent-production policy referenced by `AGENTS.md`.
- Implement `publish-proof` and `verify-pr` as repo skills.
- Enable Codex GitHub review if the repository connection and account policy allow it.
- Keep every merge manual.

Success criterion: three consecutive PRs have current-SHA receipts, no leaked data, and reviewers can understand the proof without checking out the branch.

### Phase 1: prove a safe public surface

- Build a browser verifier for the public marketing app first.
- Capture a screenshot and console/network evidence.
- Attach proof to a test PR with GitHub CLI.
- Exercise stale-verdict handling by pushing a harmless follow-up and requiring a new receipt.

Success criterion: owner and verifier independently produce the same result, and the second receipt is tied to the new head.

### Phase 2: build synthetic product verification

- Add the synthetic adapter and disposable state.
- Map the initial product flows.
- Add focused browser tests and artifact capture.
- Run them locally and from a clean worktree.

Success criterion: the harness can repeat a write flow without external Planning Center changes and reset to the same state.

### Phase 3: make verification routine

- Add `build-change`, `babysit-pr`, and custom agents.
- Run one owner and one independent verifier per behavior-changing PR.
- Track verdict escapes, false positives, blocked reasons, flakes, wall time, and token/compute cost.
- Use multi-reviewer `interrogate` only for contested or high-blast-radius changes; do not spend a four-agent panel on routine edits.

Success criterion: at least ten PRs with low proof friction, zero stale verdicts used for merge, and a browser flake rate low enough to gate.

### Phase 4: scale carefully

- Parallelize disjoint PRs in Codex worktrees.
- Keep one topology owner for each GitHub stack.
- Require independent verification at each stack head.
- Consider automatic merge only for Tier 0-1 changes after a trusted verifier can publish a real GitHub check and after the observed escape rate justifies it.
- Keep Tier 4 human-gated.

## Open decisions

These decisions materially change the implementation:

1. **Synthetic Planning Center boundary.** Should verification use a purpose-built in-process adapter, a separate test organization, or both? The safest default is an in-process adapter for write paths plus an optional read-only contract smoke against a test organization.
2. **Artifact privacy.** This repository is public. Should all UI proof be limited to synthetic data, or is there an approved private artifact store for sensitive traces? The safe default is synthetic-only media in GitHub.
3. **Merge authority.** Should Codex ever merge, or only deliver merge-ready PRs? Start with merge-ready only.
4. **Community port.** Install the existing PStack Codex port for personal experimentation, or keep production behavior entirely repo-owned? The recommended default is repo-owned skills, with the port used as a reference until its Codex mappings and upstream sync are audited.
5. **Independent identity.** Is a different subagent/model sufficient for phase one, or should the verifier eventually authenticate through a separate GitHub App and emit a required check? The latter is the stronger long-term gate.

## Bottom line

PStack's scalable idea is not “let many models code.” It is “make every meaningful claim falsifiable, produce proof on the real surface, bind the verdict to exact code, and let an independent actor challenge it.” Codex has the skills, subagents, worktrees, GitHub review, browser-tool integration points, and plugin hooks needed to reproduce that discipline. The repository still needs the two pieces that actually make the result trustworthy: a safe deterministic product harness and a SHA-bound proof protocol.
