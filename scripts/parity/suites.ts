import { calendarParitySuites } from "./calendar.parity";
import type { ParitySuite } from "./parity";
import { routesParitySuites } from "./routes.parity";
import { textParitySuites } from "./text.parity";

/** Every parity suite. Add each `scripts/parity/<module>.parity.ts` file's suites here. */
export const paritySuites: readonly ParitySuite[] = [
  ...calendarParitySuites,
  ...textParitySuites,
  ...routesParitySuites,
];
