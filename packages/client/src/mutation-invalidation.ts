import type { Procedure } from "@pcobooster/client/rpc";
import type { QueryClient } from "@tanstack/react-query";

const schedulingFamilies = [
  "my-scheduled-plans",
  "team-positions",
  "people",
  "people-plan-window-history",
  "people-candidate-details",
  "people-dashboard-activity",
  "people-dashboard-person",
];

/** Only active observers refetch; inactive histories wait until their screen is visible. */
export const invalidateMutationQueries = async (
  client: QueryClient,
  procedure: Procedure
): Promise<void> => {
  let families: string[] = [];
  if (
    procedure.startsWith("schedule.") ||
    procedure.startsWith("planPeople.") ||
    procedure.startsWith("neededPositions.")
  ) {
    families = schedulingFamilies;
  } else if (procedure.startsWith("planTimes.")) {
    families = [...schedulingFamilies, "plan-times"];
  } else if (procedure.startsWith("planItems.")) {
    families = [
      "plan-items",
      "song-history",
      "song-options",
      "song-library",
      "song-search",
    ];
  } else if (procedure.startsWith("chordCharts.")) {
    families = [
      "chord-chart-song",
      "chord-chart-pdf",
      "song-options",
      "song-library",
      "song-search",
    ];
  }
  await Promise.all(
    families.map(async (family) => {
      await client.invalidateQueries({ queryKey: [family] });
    })
  );
};
