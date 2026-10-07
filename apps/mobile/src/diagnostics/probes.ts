/**
 * Synthetic failures for proving diagnostics on a real release build. They exist only in an
 * internal verification build, archived with `EXPO_PUBLIC_DIAGNOSTICS_PROBES=1` (inlined at
 * build time, so in any other build `diagnosticsProbe` is the constant null), and run only for
 * a launch started with `-PCOBDiagnosticsProbe <kind>`:
 *
 *   xcrun devicectl device process launch --device <udid> com.pcobooster.ios \
 *     -PCOBDiagnosticsProbe handled
 *
 * | Kind | Effect |
 * | --- | --- |
 * | `startup` | Throws while `index.ts` evaluates: a fatal before the app starts, sent on the next launch |
 * | `handled` | Reports a handled error |
 * | `rejection` | Leaves a promise rejection unhandled |
 * | `render` | Throws once while rendering the root stack; Try Again recovers |
 * | `api-5xx`, `api-undecodable`, `api-network`, `api-5xx-transient` | See `probe-transport.ts` |
 *
 * There is no remote trigger and no hidden control in the app; a production build has none of
 * this. Events from a verification build carry `verification_build: true`.
 */
import { Schema } from "effect";
import { Platform, Settings } from "react-native";

export const diagnosticsProbes = [
  "startup",
  "handled",
  "rejection",
  "render",
  "api-5xx",
  "api-undecodable",
  "api-network",
  "api-5xx-transient",
] as const;
export type DiagnosticsProbe = (typeof diagnosticsProbes)[number];

const isProbe = Schema.is(Schema.Literals(diagnosticsProbes));

const readSetting = Schema.decodeUnknownSync(Schema.String);
const probesBuild =
  readSetting(process.env.EXPO_PUBLIC_DIAGNOSTICS_PROBES ?? "") === "1";

const launchProbe = (): DiagnosticsProbe | null => {
  const value: unknown = Settings.get("PCOBDiagnosticsProbe");
  return isProbe(value) ? value : null;
};

/** This launch's probe; always null outside a verification build. */
export const diagnosticsProbe: DiagnosticsProbe | null =
  probesBuild && Platform.OS === "ios" ? launchProbe() : null;

/** The synthetic error each probe raises. */
export class DiagnosticsProbeError extends Error {
  override readonly name = "DiagnosticsProbeError";
}
