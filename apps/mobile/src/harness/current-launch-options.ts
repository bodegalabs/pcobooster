import { Schema } from "effect";
import { Platform, Settings } from "react-native";

import { noLaunchOptions, parseLaunchOptions } from "./launch-options";
import type { LaunchOptions } from "./launch-options";
import { parseSmokeNetwork } from "./release-smoke";
import type { SmokeNetwork } from "./release-smoke";

/** `NSUserDefaults` hands back `-Key 250` as a number and `-Key YES` as a string. */
const isArgumentValue = Schema.is(Schema.Union([Schema.String, Schema.Number]));

/** The launch argument `key` as written, read from `NSUserDefaults`' argument domain. */
const readArgument = (key: string): string | null => {
  const value: unknown = Settings.get(key);
  return isArgumentValue(value) ? String(value) : null;
};

/** This process's launch arguments; none in Release builds and off iOS. */
export const launchOptions: LaunchOptions =
  __DEV__ && Platform.OS === "ios"
    ? parseLaunchOptions(readArgument)
    : noLaunchOptions;

/** Inlined at build time; set only by `scripts/release-smoke.sh`. */
const isReleaseSmokeBuild = process.env.EXPO_PUBLIC_PCOB_RELEASE_SMOKE === "1";

/** The smoke build's network (`release-smoke.ts`); null in every other build. */
export const releaseSmokeNetwork: SmokeNetwork | null =
  isReleaseSmokeBuild && Platform.OS === "ios"
    ? parseSmokeNetwork(readArgument("PCOBSmoke"))
    : null;
