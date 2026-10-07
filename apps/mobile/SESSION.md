# Native session verification

`session/native-sign-in.ts` owns PKCE S256, random state, exact callback validation and a single exchange per attempt. `device-services.ts` supplies the ephemeral browser and device-only SecureStore. Session credentials never enter AsyncStorage. `session-store.ts` handles remembered people, organization selection, revocation and credential-matched unauthorized responses.

The app runtime creates one product client. Each request pins its credential headers for response handling. Query caches use origin, credential fingerprint, selected organization and demo identity; restoration finishes before product content mounts. Foreground and network reconnection revalidate observed queries. Analytics uses explicit events only, with no replay or automatic collection.

Run `bun run --cwd apps/mobile ios:taps` with Metro running (`ios:taps:plan` runs the run sheet and Times flows on `pcob-expo-runsheet`; `scripts/tap-flows.sh --simulator <name> --suite session|plan` drives any named simulator). The session suite uses the simulator named `pcob-expo-session`, and runs fixture-only Maestro flows for demo links, switching people, sign-out confirmation and cancellation, and the Services filter menu. Install Maestro and OpenJDK 17 first; the script detects Homebrew's Java installation. Output lives in `.captures/tap-<suite>`.

For a read-only local check, start `bun run dev`, set `EXPO_PUBLIC_API_URL` to its product URL when starting Metro, and launch without `-PCOBMock`. Local development authenticates through the API's PAT bypass, not a browser OAuth exchange. `-PCOBServiceType <id>` limits the agenda to an explicitly chosen service type in Debug builds; production ignores launch arguments. Follow the live-check scope before opening any plan.

Capture fixtures with `ios:capture --udid <session-udid> --appearance light` and repeat for dark. Copy approved Swift reference images into `.captures/swift-light` and `.captures/swift-dark`, then run `ios:compare light` or `ios:compare dark`. Comparisons require a reference for that appearance.
