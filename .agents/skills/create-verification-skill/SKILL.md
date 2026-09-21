---
name: create-verification-skill
description: Create a repo-local app verification skill with a maintained feature map, real-surface flows, and revision-bound visual proof. Use when a new application or major product surface needs repeatable agent verification.
---

# Create a verification skill

Build a verification adapter for the actual application, not a generic test checklist.

1. Inspect the app's launch command, route structure, auth behavior, test fixtures, and destructive actions. Completion: you can name the safe verification surface and its unavailable or unsafe branches.
2. Scaffold the skill:

   ```bash
   bun run verification:create -- \
     --name verify-<app> \
     --app "<display name>" \
     --launch "<deterministic launch command>" \
     --url "<local start URL>" \
     --output-root .agents/skills
   ```

3. Replace the generic feature map with observed product flows. Each flow must name its start state, actions, assertions, failure or boundary state, and evidence target. Completion: every supported claim maps to a reproducible flow.
4. Keep production writes outside the verification surface. For mutation flows, provide a synthetic or isolated adapter before claiming coverage; otherwise record the gap explicitly.
5. Exercise the skill against one realistic change, capture proof, and validate the generated skill. Completion: another agent can launch the app, select the affected flows, and produce a non-stale receipt without rediscovering the product.

Use progressive disclosure: keep the launch/drive/evidence loop in `SKILL.md` and detailed flows in `references/feature-map.md`.
