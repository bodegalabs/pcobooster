import { ProductRpc } from "@pcobooster/contracts";
import {
  candidateDetailSchema,
  peopleDashboardActivitySchema,
  planWindowHistoryBatchSchema,
} from "@pcobooster/contracts/people-schemas";
import { Schema } from "effect";

import type { Procedure } from "./rpc";

const procedures = new Map<string, Procedure>([
  ["planning-center-accounts", "accounts.list"],
  ["planning-center-access", "access.me"],
  ["features", "features.status"],
  ["planning-center-organization-time-zone", "catalog.organization"],
  ["service-types", "catalog.serviceTypes"],
  ["plans", "catalog.plans"],
  ["plan-details", "catalog.plan"],
  ["adjacent-plans", "catalog.adjacentPlans"],
  ["team-positions", "catalog.teamPositions"],
  ["people", "people.positionCandidates"],
  ["people-search", "people.search"],
  ["people-dashboard-roster", "people.dashboardRoster"],
  ["people-dashboard-person", "people.dashboardPerson"],
  ["blockouts", "people.blockouts"],
  ["my-scheduled-plans", "people.myScheduledPlans"],
  ["plan-items", "planItems.list"],
  ["plan-times", "planTimes.list"],
  ["song-search", "songs.search"],
  ["song-library", "songs.library"],
  ["song-suggestions", "songs.suggestions"],
  ["song-history", "songs.history"],
  ["song-options", "songs.options"],
  ["chord-chart-song", "chordCharts.song"],
  ["lyrics-search", "chordCharts.lyricsSearch"],
  ["chord-chart-pdf", "chordCharts.pdf"],
]);
const history = Schema.Array(planWindowHistoryBatchSchema);
const details = Schema.Array(Schema.Array(candidateDetailSchema));
const activity = Schema.Array(peopleDashboardActivitySchema);

/** Persistence carries decoded values, including Dates; invalid or unknown families refetch. */
export const isValidProductQueryData = (
  key: readonly unknown[],
  value: typeof Schema.Unknown.Type
): boolean => {
  const [family] = key;
  if (family === "people-plan-window-history") {
    return Schema.is(history)(value);
  }
  if (family === "people-candidate-details") {
    return Schema.is(details)(value);
  }
  if (family === "people-dashboard-activity") {
    return Schema.is(activity)(value);
  }
  if (!Schema.is(Schema.String)(family)) {
    return false;
  }
  const tag = procedures.get(family);
  if (tag === undefined) {
    return false;
  }
  const rpc = ProductRpc.requests.get(tag);
  return rpc !== undefined && Schema.is(rpc.successSchema)(value);
};
