/**
 * Debug launch arguments, the same flags the Swift app read (`-PCOBMock YES`, `-PCOBRoute
 * /account`). `xcrun simctl launch <udid> com.pcobooster.ios -PCOBMock YES` puts each pair in
 * `NSUserDefaults`' argument domain, which React Native's `Settings` reads. Release builds ignore
 * every one of them.
 *
 * | Argument | Effect |
 * | --- | --- |
 * | `-PCOBMock YES` | Fixtures through the fixture transport, signed in as Jordan Hale. |
 * | `-PCOBMockSession signedIn\|signedOut` | The mock session to start in (default `signedIn`). |
 * | `-PCOBMockLatency <ms>` | Fixture reply delay (default 250). |
 * | `-PCOBFeatures all\|none\|people\|songs` | Overrides `features.status` in mock mode. |
 * | `-PCOBFixedNow YES` | Pins the app clock to the fixtures' anchor (Thu Oct 1 2026, 10 AM Pacific). |
 * | `-PCOBRoute <path>` | Opens a path at launch (`/account`). |
 * | `-PCOBTab services\|people\|songs\|search` | Selects a tab at launch. |
 * | `-PCOBGallery YES` | Shows the design system gallery instead of the app. |
 */
/** Thu Oct 1 2026, 10 AM in Los Angeles (Swift `MockFixtures.anchorNow`). */
export const FIXTURE_ANCHOR_NOW = new Date("2026-10-01T17:00:00.000Z");

const DEFAULT_LATENCY_MS = 250;

export type MockSession = "signedIn" | "signedOut";
export type LaunchTab = "services" | "people" | "songs" | "search";
export type FeatureOverride = "all" | "none" | "people" | "songs";

export interface LaunchOptions {
  readonly mock: boolean;
  readonly mockSession: MockSession;
  readonly mockLatencyMs: number;
  readonly features: FeatureOverride | null;
  readonly fixedNow: boolean;
  readonly route: string | null;
  readonly tab: LaunchTab | null;
  readonly showsGallery: boolean;
}

export const noLaunchOptions: LaunchOptions = {
  mock: false,
  mockSession: "signedIn",
  mockLatencyMs: DEFAULT_LATENCY_MS,
  features: null,
  fixedNow: false,
  route: null,
  tab: null,
  showsGallery: false,
};

/** A launch argument's value as written, or null when it was not passed. */
export type ArgumentReader = (key: string) => string | null;

const readString = (read: ArgumentReader, key: string): string | null => {
  const value = read(key);
  return value === "" ? null : value;
};

/** `NSUserDefaults` booleans: `YES`, `true`, or `1`. */
const readFlag = (read: ArgumentReader, key: string): boolean => {
  const value = readString(read, key)?.toLowerCase();
  return value === "yes" || value === "true" || value === "1";
};

const pick = <Value extends string>(
  value: string | null,
  allowed: readonly Value[]
): Value | null => allowed.find((candidate) => candidate === value) ?? null;

/** The options `read` describes (separate from `Settings` so tests pass plain values). */
export const parseLaunchOptions = (read: ArgumentReader): LaunchOptions => {
  const latency = Number(readString(read, "PCOBMockLatency"));
  return {
    mock: readFlag(read, "PCOBMock"),
    mockSession:
      pick(readString(read, "PCOBMockSession"), [
        "signedIn",
        "signedOut",
      ] as const) ?? "signedIn",
    mockLatencyMs:
      Number.isFinite(latency) && readString(read, "PCOBMockLatency") !== null
        ? Math.max(0, latency)
        : DEFAULT_LATENCY_MS,
    features: pick(readString(read, "PCOBFeatures"), [
      "all",
      "none",
      "people",
      "songs",
    ] as const),
    fixedNow: readFlag(read, "PCOBFixedNow"),
    route: readString(read, "PCOBRoute"),
    tab: pick(readString(read, "PCOBTab"), [
      "services",
      "people",
      "songs",
      "search",
    ] as const),
    showsGallery: readFlag(read, "PCOBGallery"),
  };
};
