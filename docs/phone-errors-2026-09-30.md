# September 30 phone-use failures

## Observed incident

At 12:24:05.166 through 12:24:09.220 PDT (19:24 UTC), production recorded 23 API exceptions in PostHog project 614621:

- 13 `UNHANDLED` errors: Cloudflare rejected reading a request-owned `ReadableStreamSource` from another request context. Captured stacks end in oRPC `StandardRPCCodec.decode`, `Object.body`, and `toStandardBody`, reading the incoming RPC body.
- 10 `BAD_GATEWAY` errors: `PlanningCenterApiError`, message `Planning Center API error: 404`. Six were `catalog.plans`; one each were `catalog.plan`, `catalog.teamPositions`, `planItems.list`, and `planTimes.list`.
- `app opened` and `$pageview` events from Mobile Safari on iOS occurred at 12:24:09.008 and 12:24:09.356 PDT. This correlates the incident with mobile use, but API service identity does not establish which person made each failed request.

[Slack example](https://bodealabs.slack.com/archives/C0C4YJLQL85/p1790796254599939), [request-body error issue](https://us.posthog.com/project/614621/error_tracking/01a0f3c6-2c68-7202-98f2-91c00aae00ec), [provider 404 issue](https://us.posthog.com/project/614621/error_tracking/01a0f3c6-3f5a-7b52-be7d-ca44941c17b7).

These events have no `simulated` marker. Three separate September 29 exceptions are explicitly `SIMULATED` and describe alert-delivery tests. The September 23 through September 30 query found no other real exceptions. This is capture evidence, not proof that no uncaptured failures occurred.

The enabled [Every failure destination](https://us.posthog.com/project/614621/functions/01a0f2fb-c7ec-0000-2b56-a1c6c9a4558a) routes every `$exception`, `workflow failed`, and `sign in failed` event to Slack. Its filters have no frequency or issue-lifecycle gate. The literal `$exception` in Slack is the captured event name; API events lack the richer browser operation/person context. The flood is consistent with this deliberate policy, not evidence of twenty-three independent bugs. Error capture and the destination are preserved.

Production had already deployed `ccc6f08185e549d9659121638b155527cdb469dc` and passed its serving-commit check at 17:15 UTC. The earlier Cloudflare deployment authorization failure is separate from this incident.

## Proposed mitigation

The API currently awaits an isolate-shared cached application before Hono/oRPC lazily reads the incoming body. Prepare JSON RPC bodies as owned bytes before that wait, and construct the handler's Request afterward. Constructing the Request before the wait would still create a request-owned native stream.

Scope is only JSON (including oRPC's missing-content-type JSON fallback) at `/api/rpc` and descendants. Auth, multipart, reference, and other streaming paths keep existing handling. Method, URL, headers, and abort signal are retained. Payload acceptance is unchanged; buffering adds a temporary byte copy and does not introduce a new size cap. Existing cached initialization-failure behavior is unchanged.

A native workerd regression demonstrates the ownership problem: retaining the original Request across invocations produces the exact Cloudflare error; retaining bytes and reconstructing the Request in the later invocation succeeds. This proves the mitigation's ownership boundary. It does **not** reproduce the precise production cold-start race. A separate 24-request concurrent burst through a service-binding proxy with delayed bodies passes both before and after the change. Treat this change as a proposed mitigation, not a confirmed root-cause fix.

## Verification and remaining investigation

`bun run ci` passed strict lint, type checks, and 1,337 tests. `bun run build` passed all three app builds. Independent verification returned `PASS_WITH_NOTES`, including native workerd ownership and unchanged auth/multipart boundaries. No merge or deployment has been performed.

The production Cloudflare telemetry query returned 403 with the existing credential. No token permissions were changed. PostHog captures RPC paths, request IDs, and root exception messages, but not provider endpoint IDs or 404 response bodies. Without those details, a stale/deleted resource, selected-account permissions, or an incorrect provider endpoint cannot be distinguished confidently. Provider failures remain reported; none is reclassified or suppressed.

Next authorized investigation should use a log-reading credential to correlate these request IDs, beginning with `f88cae29-6b74-423e-80f0-e1752395e819` (`catalog.plans`) and `c48e2826-7d5d-49af-8dff-5a42ffaa84aa` (`catalog.plan`). Review the recorded provider path/query keys and account/cache scope without exposing credentials. After approval to deploy the mitigation, verify concurrent mobile startup and new error events before considering the incident resolved.
