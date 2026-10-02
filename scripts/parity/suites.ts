import { calendarParitySuites } from "./calendar.parity";
import { chordChartParitySuites } from "./chord-charts.parity";
import { musicParitySuites } from "./music.parity";
import type { ParitySuite } from "./parity";
import { peopleParitySuites } from "./people.parity";
import { plansParitySuites } from "./plans.parity";
import { routesParitySuites } from "./routes.parity";
import { schedulingParitySuites } from "./scheduling.parity";
import { songsParitySuites } from "./songs.parity";
import { textParitySuites } from "./text.parity";

/** Every parity suite. Add each `scripts/parity/<module>.parity.ts` file's suites here. */
export const paritySuites: readonly ParitySuite[] = [
  ...calendarParitySuites,
  ...textParitySuites,
  ...routesParitySuites,
  ...musicParitySuites,
  ...chordChartParitySuites,
  ...schedulingParitySuites,
  ...plansParitySuites,
  ...songsParitySuites,
  ...peopleParitySuites,
];
