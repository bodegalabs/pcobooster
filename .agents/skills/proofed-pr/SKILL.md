---
name: proofed-pr
description: Build, independently verify, publish proof for, and monitor a trustworthy pull request. Use when opening or updating a PR whose claims should be bound to the exact reviewed revision.
---

# Proofed PR

Use [docs/proofed-delivery.md](../../../docs/proofed-delivery.md) as the evidence contract.

## Owner pass

Implement the requested change in an isolated branch or worktree. Run focused tests during development, then `bun run ci` and the risk-appropriate build or browser verification. Commit before producing proof; receipts bind to committed Git state.

Completion: the change is reviewable, deterministic gates pass, and every user-visible claim has evidence or a stated limitation.

## Independent verifier

When delegation is available, give a fresh agent only the user request, branch or worktree, and this skill. Ask it to inspect the diff, select affected flows, rerun relevant gates, and try to falsify the owner claims. The verifier must not inherit the owner's proposed verdict.

For high or critical risk, absence of an independent pass is `BLOCKED`. For lower risk, record the missing pass as a note rather than inventing one.

Completion: the verifier returns `PASS`, `PASS_WITH_NOTES`, `FAIL`, or `BLOCKED`, with concrete commands and observed behavior.

## Bind and publish

Fetch the PR base, then run `bun run proof -- run --base <pr-base-branch>` with the verified flows, media, limitations, and the independent result via `--verifier-verdict` and `--verifier-summary`. Critical changes also require `--rollback`. `--risk` may raise the path-derived tier but cannot lower it. Use `origin/main` only for a bottom PR; each upper stack layer uses its preceding remote branch. Validate the receipt after the final push. A material push or base-branch update invalidates earlier proof even when the prose still sounds correct.

When PR publication is in scope, publish with:

```bash
bun run proof -- publish --pr <number-or-url> --receipt <receipt.json>
```

The publisher rejects a mismatched PR head and duplicate proof for the same SHA.

Completion: the PR body states risk and rollback, the proof comment is attached to the current head, and GitHub reports the `ci` and `Vercel` gates for that revision.

## Babysit

Wait for current checks, review new failures once, and fix root causes in a new focused commit. Re-run independent verification and publish a new receipt after any material push. Stop on a product decision, unavailable external system, or repeated identical blocker; report it instead of looping.
