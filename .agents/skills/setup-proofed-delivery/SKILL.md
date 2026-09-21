---
name: setup-proofed-delivery
description: Set up or audit this repository's revision-bound PR proof workflow, including CI naming, GitHub media support, required checks, and repo-local verification skills.
---

# Set up proofed delivery

Use this when enabling the workflow on a new checkout or auditing why proof cannot be produced.

1. Read [docs/proofed-delivery.md](../../../docs/proofed-delivery.md). Completion: the local gate, evidence contract, and remote merge gates are identified.
2. Run `bun run proof -- doctor`. Fix every failed local prerequisite before continuing. GitHub CLI 2.99.0 or newer is required because earlier versions cannot attach screenshots or videos to PR comments.
3. Confirm `bun run ci`, `bun run build`, the `ci` workflow job, and `.github/pull_request_template.md` exist. Completion: local and GitHub names agree.
4. Inspect the active `main` ruleset and open PRs before changing a required-check name. Change the ruleset only when the new check exists on an open PR and the migration will not strand another PR. Completion: `ci` and `Vercel` are the required contexts.
5. Validate every changed skill with the available skill validator and run its deterministic scripts or focused tests. Completion: skill frontmatter is valid and no scaffold text remains.

Report any missing browser surface or unsafe external dependency as a verification gap. Setup is complete only when a clean committed revision can produce and validate a proof receipt.
