import { Option, Schema } from "effect";
import { flow } from "effect/Function";

export const COLLAPSED_TEAMS_KEY = "schedule-collapsed-teams:by-plan";
export type CollapsedTeams = Readonly<Record<string, readonly string[]>>;
const decode = Schema.decodeUnknownOption(
  Schema.Record(Schema.String, Schema.Array(Schema.String))
);

const emptyPreferences = (): CollapsedTeams => ({});
export const decodeCollapsedTeams = flow(
  decode,
  Option.getOrElse(emptyPreferences)
);

export const collapsedTeams = (
  saved: CollapsedTeams,
  planId: string
): ReadonlySet<string> => new Set(saved[planId]);

export const setCollapsedTeams = (
  saved: CollapsedTeams,
  planId: string,
  teams: ReadonlySet<string>
) => ({ ...saved, [planId]: [...teams] }) satisfies CollapsedTeams;
