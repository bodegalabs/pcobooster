import type {
  blockoutSchema,
  peopleDashboardActivityBatchSchema,
  peopleDashboardActivitySchema,
  peopleDashboardMonthDaySchema,
  peopleDashboardMonthSchema,
  peopleDashboardPersonDetailSchema,
  peopleDashboardPersonSchema,
  peopleDashboardRosterPersonSchema,
  peopleDashboardRosterSchema,
  peopleDashboardTeamSchema,
  servingRhythmSchema,
} from "@pcobooster/contracts/http/people-schemas";

/** The People reads as the product client decodes them. */
export type Roster = typeof peopleDashboardRosterSchema.Type;
export type RosterPerson = typeof peopleDashboardRosterPersonSchema.Type;
export type RosterTeam = typeof peopleDashboardTeamSchema.Type;
export type DashboardMonth = typeof peopleDashboardMonthSchema.Type;
export type MonthDay = typeof peopleDashboardMonthDaySchema.Type;
export type Activity = typeof peopleDashboardActivitySchema.Type;
export type ActivityBatch = typeof peopleDashboardActivityBatchSchema.Type;
export type DashboardPerson = typeof peopleDashboardPersonSchema.Type;
export type PersonDetail = typeof peopleDashboardPersonDetailSchema.Type;
export type ServingRhythm = typeof servingRhythmSchema.Type;
export type Blockout = typeof blockoutSchema.Type;
