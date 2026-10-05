# Native app guidance

Read root AGENTS.md first. `apps/mobile` replaces the former Swift app; keep web and native UI separate while sharing Effect Schema contracts, the Effect RPC client, query keys and pure Planning Center rules.

- Use the exact Expo/React Native versions in package.json. Check pinned package source and versioned Expo docs for native APIs. Bun manages dependencies; never edit generated pods or node_modules to fix compatibility.
- Product operations use `@pcobooster/client/rpc`; native fetch omits cookies and sends secure bearer/account/demo headers. Better Auth browser PKCE/exchange remains ordinary HTTP. SecureStore owns tokens; AsyncStorage must never hold bearer credentials.
- Cache, preference and query scopes must isolate origin, credential hash, selected account and demo identity. Persist tagged Dates without converting ordinary ISO strings to Date objects. Restore appearance and scoped account preferences.
- Query functions carry AbortSignal through callForQuery. Retained tab state does not authorize hidden progressive fan-out: pause new batches when a screen loses focus. Preserve continuation cursors, no-progress guards and bounded concurrency.
- Native controls use React Native styles, safe areas, keyboard avoidance, accessible labels and meaningful touch targets. shadcn belongs to the web app. Retain feature gating, demo write protection and errors/retry states.
- Keep bundle identity, callback schemes, team, icon, privacy declarations and supported deep links. Review universal-link association changes with the web endpoint.
- Build with Expo prebuild plus xcodebuild/Gradle. Generated ios/android/build/.expo outputs are ignored. A simulator build, release archive, real-device run and store upload are separate states. No upload/submission is implicit in a build command.
- Fictional fixtures under src/fixtures are retained behavior evidence. Keep them byte-exact and validate them against native contracts; scheduling mutation tests must use an isolated synthetic provider, never live church data or presentation mode.

See MIGRATION.md and ../../docs/mobile.md for workflows, build commands and current acceptance evidence.
