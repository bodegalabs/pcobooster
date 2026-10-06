# HttpApi restack

Run this from each rebased Expo worktree, starting at foundation and proceeding through session, plan, runsheet, and assign:

```sh
bun scripts/codemods/httpapi-call-sites.ts apps/mobile apps/web apps/server scripts
bun run fix
bun run typecheck
bun run test
```

The script derives input placement from `procedureRoutes` in contracts. It rewrites `client.call("group.endpoint", input, options)` to `client.run((api) => api.group.endpoint({ params, query, payload }), options)`, preserving options and moving each input field to the declared part. `health` becomes `health.get`. Effect 4 RC names URL parameters `query`. POST reads carry their cursor in `payload`; DELETE context travels in `query`. Spreads keep their original order and go to both parts, whose schemas discard extra fields. Input variables can go to both parts. Expressions that need single evaluation, computed fields, unknown tags, and variable tags are reported for a hand edit.

It also changes version imports and constants, legacy version headers to `api=<N>`, and old product URLs. A literal `makeProductClient` URL becomes an origin. URLs passed through variables need a hand review to ensure client construction receives an origin. Raw product URLs become `/api/v1` and need an endpoint suffix. `formatClientHeader` keeps its name. Query wrappers become `callForQuery(context, client, (api) => api.group.endpoint(...))`. This helper supplies the signal and current priority and excludes mutations. Runs are idempotent. Review the diff and every reported hand edit.

Derive old input/output aliases from the native method instead of restoring string tag types. For example, `Parameters<ProductApi["people"]["candidateDetails"]>[0]` is the request, and `Effect.Success<ReturnType<ProductApi["people"]["candidateDetails"]>>` is its response. Remove obsolete `client.dispose()` calls; the native client owns no managed runtime. Keep the existing TanStack Query keys, persistence, scheduler, and error handling. Atom migration is outside this change.

The fixture transport needs a deliberate rewrite once in foundation. Import `procedureRoutes` and `matchRoute` from contracts. Match `request.method` and `new URL(request.url).pathname`; the result supplies the tag, decoded path params, kind, and input placement. For `input: "body"`, read JSON. For `input: "query"`, collect URL search params, preserving repeated keys as arrays and single keys as scalars. Merge these with the matched path params and dispatch the existing scenario by `route.tag`. Match failures must answer the HTTP contract: readable RequestRejected JSON for unknown endpoints, or the same fault at 405 with Allow for wrong methods. Return successful values as ordinary JSON. Encode faults through their contracts schemas so server-only fields cannot leak, then return the encoded JSON with the declared HTTP status, never an RPC envelope. Preserve Retry-After, the release header, and no-store.

Native bearer, account, and demo headers are still read at send time from `httpHeaders`. Use `client: "expo"` and an API origin. Run the scenario suite and real device checks in the coordinator's assigned mobile worktree after reviewing these edits. This transport branch does not edit or push mobile layers.
