/**
 * The `startup` probe (`probes.ts`): imported by `index.ts` after diagnostics and before the
 * router, it throws while the entry module evaluates, as a broken module would.
 */
import { DiagnosticsProbeError, diagnosticsProbe } from "./probes";

if (diagnosticsProbe === "startup") {
  throw new DiagnosticsProbeError("Diagnostics probe: startup");
}
