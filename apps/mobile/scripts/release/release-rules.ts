/**
 * The rules a TestFlight release follows before anything reaches Apple: which credentials sign it,
 * and which build number it may use. `release-cli.ts` applies them; `release-ios.sh` calls it.
 */

/** The native app before the Expo migration shipped build 292 for version 0.1.0. */
export const BUILD_NUMBER_FLOOR = 292;

const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const FALSE_FORMS = new Set(["", "0", "false", "no", "off"]);

/** Environment variables that mark a run as automation, as CI providers set them. */
const AUTOMATION_VARIABLES = [
  "CI",
  "GITHUB_ACTIONS",
  "BUILDKITE",
  "CIRCLECI",
  "GITLAB_CI",
  "JENKINS_URL",
  "TF_BUILD",
] as const;

/**
 * The variable that marks this run as automation, or null for an interactive local run. Any
 * value but an empty or false-like one counts, so `CI=1`, `CI=yes`, and `CI=TRUE` all do.
 */
export const automationMarker = (
  env: Readonly<Record<string, string | undefined>>
): string | null =>
  AUTOMATION_VARIABLES.find((name) => {
    const value = env[name];
    return value !== undefined && !FALSE_FORMS.has(value.trim().toLowerCase());
  }) ?? null;

export type SigningMode = "api-key" | "xcode-account";

export interface SigningInput {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Whether a complete App Store Connect API key was supplied. */
  readonly hasKey: boolean;
}

/**
 * How the export signs. A supplied key signs unless `PCOB_RELEASE_SIGNING=xcode-account` asks
 * for the Apple account signed into Xcode (the key then only checks build numbers). Automation
 * never falls back to an account on the machine.
 */
export const signingMode = ({ env, hasKey }: SigningInput): SigningMode => {
  const requested = env.PCOB_RELEASE_SIGNING ?? "";
  if (!["", "api-key", "xcode-account"].includes(requested)) {
    throw new Error("PCOB_RELEASE_SIGNING must be api-key or xcode-account.");
  }
  const marker = automationMarker(env);
  const mode: SigningMode =
    requested === "xcode-account" || (requested === "" && !hasKey)
      ? "xcode-account"
      : "api-key";
  if (mode === "xcode-account" && marker !== null) {
    throw new Error(
      `${marker} marks this run as automation, which must sign with an App Store Connect API key, not an Apple account in Xcode.`
    );
  }
  if (mode === "api-key" && !hasKey) {
    throw new Error(
      "PCOB_RELEASE_SIGNING=api-key needs ASC_KEY_ID, ASC_ISSUER_ID, and a private key."
    );
  }
  return mode;
};

/** A build number as typed: a positive integer without leading zeros, or an error. */
export const parseBuildNumber = (value: string): number => {
  if (!POSITIVE_INTEGER.test(value)) {
    throw new Error(
      "BUILD_NUMBER must be a positive integer without leading zeros."
    );
  }
  return Number(value);
};

/** Build numbers already taken: uploaded or processing in App Store Connect, or claimed here. */
export interface TakenBuildNumbers {
  /** From App Store Connect builds and build uploads; null when no key could ask. */
  readonly appStoreConnect: readonly number[] | null;
  /** Claimed by earlier release runs on this machine, uploaded or not. */
  readonly claimed: readonly number[];
}

const highest = (numbers: readonly number[]): number => {
  let max = BUILD_NUMBER_FLOOR;
  for (const value of numbers) {
    max = Math.max(max, value);
  }
  return max;
};

/**
 * The build number a release uses. With App Store Connect's numbers known, the next one after
 * every taken number, or the requested one when it is higher than all of them. Without them, only
 * an explicit number, still above the floor and every local claim. Apple rejects a build number
 * at or below one it already has, so a number never goes backward, even after a failed upload.
 */
export const chooseBuildNumber = (
  taken: TakenBuildNumbers,
  requested: number | null
): number => {
  const known = [...(taken.appStoreConnect ?? []), ...taken.claimed];
  const ceiling = highest(known);
  if (requested === null) {
    if (taken.appStoreConnect === null) {
      throw new Error(
        "Without an App Store Connect API key to check build numbers, set BUILD_NUMBER to a number above every uploaded build."
      );
    }
    return ceiling + 1;
  }
  if (requested <= ceiling) {
    const source = taken.claimed.includes(ceiling)
      ? "a release on this machine claimed"
      : "App Store Connect already has";
    throw new Error(
      `BUILD_NUMBER ${requested} is not above ${ceiling}, which ${ceiling === BUILD_NUMBER_FLOOR ? "the previous native app shipped" : source}.`
    );
  }
  return requested;
};

/**
 * Whether a chosen build number is still free just before upload: another release may have
 * uploaded it, or a higher one, while this one archived.
 */
export const stillUnused = (
  build: number,
  appStoreConnect: readonly number[]
): void => {
  const ceiling = highest(appStoreConnect);
  if (build <= ceiling) {
    throw new Error(
      `App Store Connect now has build ${ceiling}, so build ${build} cannot upload. Nothing was uploaded; start a new release.`
    );
  }
};
