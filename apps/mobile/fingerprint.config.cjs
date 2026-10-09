// @ts-check
/**
 * What the runtime version hashes: an over-the-air update (docs/ci-cd.md#ios-updates-over-the-air)
 * reaches only builds whose native layer matches, and Expo's fingerprint of these inputs is the
 * runtime version both the build and the update publisher compute. Anything here that varies by
 * machine or build number would keep a correct update from reaching the builds it fits, so:
 * - versions (`version`, `ios.buildNumber`) and package.json scripts never change native code;
 * - `ccacheEnabled` only says whether the building Mac has ccache, so the evaluated app config is
 *   hashed with one value for it on every Mac.
 * Native inputs the default sources miss are added: `app.config.ts` itself (Expo hashes only its
 * evaluated output, not the config plugin code in it), the asset catalog that plugin copies into
 * the app, the update signing certificate embedded in it, and dependency patches (`patches/`).
 * Under bun's isolated install, Expo identifies third-party native modules by package name,
 * version, and store path rather than file contents; a patch is the one way their code changes
 * without those changing.
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
  // Expo ignores app config files by default; this one also holds a config plugin.
  ignorePaths: ["!app.config.ts"],
  extraSources: [
    {
      type: "file",
      filePath: "app.config.ts",
      reasons: ["the config plugin that copies the asset catalog"],
    },
    {
      type: "dir",
      filePath: "../../patches",
      reasons: ["patches can change a dependency's native code"],
    },
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
