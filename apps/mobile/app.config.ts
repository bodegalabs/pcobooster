import { execFileSync } from "node:child_process";
import { cpSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import type { ExpoConfig } from "expo/config";
import type { ConfigPlugin } from "expo/config-plugins.js";
import { withDangerousMod } from "expo/config-plugins.js";

import { iosBuildNumber } from "./scripts/build-number.ts";

const catalogDirectory = path.join(import.meta.dirname, "assets/catalog");
const catalogEntry = /\.(?:symbolset|imageset)$/u;

/**
 * Copies `assets/catalog` (the custom symbols SF Symbols lacks, the drum and the rocket glyph,
 * and the Planning Center and rocket images) into the generated asset catalog, so SwiftUI
 * `Image(assetName:)` finds them by name.
 */
const withCatalogAssets: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    "ios",
    (next) => {
      const catalog = path.join(
        next.modRequest.platformProjectRoot,
        next.modRequest.projectName ?? "PCOBooster",
        "Images.xcassets"
      );
      for (const entry of readdirSync(catalogDirectory)) {
        if (catalogEntry.test(entry)) {
          cpSync(
            path.join(catalogDirectory, entry),
            path.join(catalog, entry),
            {
              recursive: true,
            }
          );
        }
      }
      return next;
    },
  ]);

/**
 * Whether ccache is on this machine's PATH. Prebuild writes the answer into
 * `Podfile.properties.json`, so a machine or CI runner without ccache compiles with plain clang.
 */
const hasCcache = (): boolean => {
  try {
    execFileSync("/bin/sh", ["-c", "command -v ccache"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const config: ExpoConfig = {
  name: "PCOBooster",
  slug: "pcobooster",
  version: "0.1.0",
  // Release links use `pcobooster://`; development builds also answer `pcobooster-dev://`.
  scheme: ["pcobooster", "pcobooster-dev"],
  orientation: "default",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.pcobooster.ios",
    deploymentTarget: "16.4",
    icon: "./assets/app-icon.icon",
    // iPhone and iPad share the supported feature workflows; Android remains deferred.
    supportsTablet: true,
    infoPlist: {
      CADisableMinimumFrameDurationOnPhone: true,
      ITSAppUsesNonExemptEncryption: false,
      LSApplicationCategoryType: "public.app-category.productivity",
    },
  },
  plugins: [
    "expo-router",
    // Without scene support the app cannot launch on the iOS 27 SDK.
    [
      "expo-build-properties",
      { ios: { ccacheEnabled: hasCcache(), enableSceneSupport: true } },
    ],
  ],
  experiments: { typedRoutes: false },
};

const appConfig = (): ExpoConfig =>
  withCatalogAssets({
    ...config,
    ios: {
      ...config.ios,
      buildNumber: iosBuildNumber(String(process.env.BUILD_NUMBER ?? "1")),
    },
  });

export default appConfig;
