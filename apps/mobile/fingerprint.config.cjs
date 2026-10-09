// @ts-check
/**
 * What the runtime version hashes: an over-the-air update (docs/ci-cd.md#ios-updates-over-the-air)
 * reaches only builds whose native layer matches, and Expo's fingerprint of these inputs is the
 * runtime version both the build and the update publisher compute. Anything here that varies by
 * machine or build number would keep a correct update from reaching the builds it fits, so:
 * - versions (`version`, `ios.buildNumber`) and package.json scripts never change native code;
 * - `ccacheEnabled` only says whether the building Mac has ccache, so the evaluated app config is
 *   hashed with one value for it on every Mac.
 * Two native inputs the default sources miss are added: the asset catalog the config plugin copies
 * into the app (`app.config.ts`), and the update signing certificate embedded in it.
 */

/** The ccache setting as it appears in the evaluated app config, either value. */
const CCACHE_SETTING = /"ccacheEnabled":(?:true|false)/gu;

/**
 * Hashes the evaluated app config with one ccache value; every other source passes through.
 * @type {import("@expo/fingerprint").FileHookTransformFunction}
 */
const withoutMachineSettings = (source, chunk) =>
  source.type === "contents" && source.id === "expoConfig" && chunk !== null
    ? String(chunk).replaceAll(CCACHE_SETTING, '"ccacheEnabled":"machine"')
    : chunk;

/** @type {import("@expo/fingerprint").Config} */
module.exports = {
  sourceSkips: ["ExpoConfigVersions", "PackageJsonScriptsAll"],
  extraSources: [
    {
      type: "dir",
      filePath: "assets/catalog",
      reasons: ["app.config.ts copies these into the native asset catalog"],
    },
    {
      type: "file",
      filePath: "certs/updates-certificate.pem",
      reasons: ["the update signing certificate embedded in the app"],
    },
  ],
  fileHookTransform: withoutMachineSettings,
};
