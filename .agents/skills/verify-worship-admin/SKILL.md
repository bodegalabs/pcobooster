---
name: verify-worship-admin
description: Verify worshipadmin.com changes on the rendered marketing or product surface and capture visual proof. Use after deterministic checks when a change affects routes, UI, auth boundaries, or user-visible behavior.
---

# Verify worshipadmin.com

Read [references/feature-map.md](references/feature-map.md) and select every flow touched by the diff.

## Launch

- Public marketing-only changes: run `bun run dev:marketing` and use `http://127.0.0.1:3002`.
- Integrated product changes: run `bun run dev`. Treat missing Infisical access or provider credentials as a blocked environment, not a product failure.
- A Vercel preview may replace local launch when its head SHA matches the revision being proved.

Completion: the selected surface responds, the rendered page matches the target revision, and the browser console has no startup error.

## Drive

Use the available browser-verification skill or browser automation. Prefer visible roles and labels over layout selectors. Exercise the success state plus one relevant empty, error, auth, or boundary state. Keep Planning Center access read-only: presentation mode masks data but does not isolate provider writes.

Completion: every changed behavior is observed on the rendered surface or recorded as an explicit limitation.

## Evidence

Capture the smallest image or video set that proves the behavior. Then run:

```bash
bun run proof -- run \
  --base <pr-base-branch> \
  --flow "<verified flow>" \
  --artifact "<path>#<useful alt text>"
```

Completion: the receipt is `PASS` or `PASS_WITH_NOTES`, and `bun run proof -- verify --receipt <path>` succeeds on the same checkout.

Fetch the PR base before proving. Use `origin/main` for a bottom PR and the preceding remote branch for an upper stack layer.

## Cleanup

Stop local servers and leave proof media under ignored `.artifacts/`. Do not claim mutation coverage until a synthetic Planning Center adapter exists for that flow.
