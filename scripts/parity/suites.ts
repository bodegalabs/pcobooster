import { calendarParitySuites } from "./calendar.parity";
import { chordChartParitySuites } from "./chord-charts.parity";
import { musicParitySuites } from "./music.parity";
import type { ParitySuite } from "./parity";
import { routesParitySuites } from "./routes.parity";
import { schedulingParitySuites } from "./scheduling.parity";
import { textParitySuites } from "./text.parity";

/** Every parity suite. Add each `scripts/parity/<module>.parity.ts` file's suites here. */
export const paritySuites: readonly ParitySuite[] = [
  ...calendarParitySuites,
  ...textParitySuites,
  ...routesParitySuites,
  ...musicParitySuites,
  ...chordChartParitySuites,
  ...schedulingParitySuites,
];
