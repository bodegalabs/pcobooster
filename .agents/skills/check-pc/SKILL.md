---
name: check-pc
description: Check a Planning Center Services API endpoint against real read-only data, local endpoint docs, and PAT credentials. Use for contract or provider-response investigation, not product UI verification.
---

# Check Planning Center API (`check-pc`)

Use this when you need to **verify a Planning Center JSON:API endpoint** against real data: compare responses with `**docs/planning-center-api/`** (especially `docs/planning-center-api/services/2018-11-01/`), with some debug credentials.

---

## Prerequisites

- Repo root as the working directory.
- Env vars in `**.env.local**` (or exported in your shell), matching `PlanningCenterCoreClient`:
  - `**PLANNING_CENTER_CLIENT**` — API application ID
  - `**PLANNING_CENTER_PAT**` — personal access token
- Bun loads `.env`, `.env.local`, `.env.production`, etc. automatically when run from the project directory (see [Bun env files](https://bun.sh/docs/runtime/env)).

Do **not** log or commit tokens. Keep scripts read-only (GET) unless you are intentionally mutating data.

## Pattern: one-off `bun -e`

Bun evaluates the string as an ES module. Import `**node-fetch`** is unnecessary — use global `fetch`.

1. Open the relevant vertex doc under `docs/planning-center-api/services/.../vertices/` (e.g. `plan.md`, `plan_person.md`) for the path, query params, and `include` spelling.
2. Run from repo root:

```bash
bun -e '
const id = process.env.PLANNING_CENTER_CLIENT;
const pat = process.env.PLANNING_CENTER_PAT;
if (!id || !pat) throw new Error("Set PLANNING_CENTER_CLIENT and PLANNING_CENTER_PAT (e.g. in .env.local)");
const auth = Buffer.from(`${id}:${pat}`).toString("base64");
const url =
  "https://api.planningcenteronline.com/services/v2/service_types/SERVICE_TYPE_ID/plans/PLAN_ID/team_members?per_page=100&include=person,team,plan";
const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
const body = await res.text();
console.log(res.status, body.slice(0, 2000));
'
```

Replace `SERVICE_TYPE_ID` / `PLAN_ID` and the path with whatever you are validating.

1. For pagination, follow `links.next` in the JSON or use the same pattern as `PlanningCenterCoreClient.fetchAllWithIncluded` (repeated GETs until no `next`).

## Tips

- **Auth**: PAT flow uses **HTTP Basic** with `client_id:pat` (same as `core-client.ts`).
- **Discover IDs**: use list endpoints (e.g. `service_types`, `plans`) with `per_page=100` and narrow with filters documented in the local markdown.
- **OAuth in the browser** is separate; scripts in this skill assume **PAT + client id** for automation.
- Prefer **read-only** calls; POST/PATCH/DELETE should match payloads in the official docs and be treated as production writes.

## When to use

- “Does this person appear on `plan_people` vs `team_members`?”
- “What does Planning Center return for this `include`?”
- “Sanity-check pagination / filters vs what the app implements.”

For deeper behavior and layering (routes → use-cases → services), follow `**AGENTS.md`** in this repository.
