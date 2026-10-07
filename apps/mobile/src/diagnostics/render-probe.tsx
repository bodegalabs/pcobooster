import { DiagnosticsProbeError, diagnosticsProbe } from "./probes";

const pending = { render: diagnosticsProbe === "render" };

/** The `render` probe (`probes.ts`): throws on its first render only, so Try Again recovers. */
export const RenderProbe = () => {
  if (pending.render) {
    pending.render = false;
    throw new DiagnosticsProbeError("Diagnostics probe: render");
  }
  return null;
};
