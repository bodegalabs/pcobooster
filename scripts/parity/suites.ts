import { chordChartParitySuites } from "./chord-charts.parity";
import { musicParitySuites } from "./music.parity";
import type { ParitySuite } from "./parity";

/** Every parity suite. Add each `scripts/parity/<module>.parity.ts` file's suites here. */
export const paritySuites: readonly ParitySuite[] = [
  ...musicParitySuites,
  ...chordChartParitySuites,
];
