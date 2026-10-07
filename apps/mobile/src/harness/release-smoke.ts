/**
 * Release smoke builds: a Release build made with `EXPO_PUBLIC_PCOB_RELEASE_SMOKE=1`
 * (`scripts/release-smoke.sh`, never `release-ios.sh`) keeps the real Keychain, app storage,
 * query-cache restoration, and native startup, but answers every request from the fixtures, or
 * fails it as a lost connection, so cold launches can be checked without production
 * credentials or data. `-PCOBSmoke offline` picks the failing network; anything else, the
 * fixtures. Builds without the variable never read the argument.
 */
export type SmokeNetwork = "online" | "offline";

export const parseSmokeNetwork = (value: string | null): SmokeNetwork =>
  value === "offline" ? "offline" : "online";

/** What React Native's fetch throws when the device has no connection. */
export const offlineFetch: typeof globalThis.fetch = async () => {
  await Promise.resolve();
  throw new TypeError("Network request failed");
};
