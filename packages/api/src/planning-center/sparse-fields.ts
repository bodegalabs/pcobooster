/**
 * Sparse fieldsets (`fields[Type]=...`) for the heaviest Planning Center reads.
 *
 * By default Planning Center computes every attribute of every resource it returns, including
 * counters such as a plan's `items_count`, `needed_positions_count`, and `total_length`, and a
 * schedule's `position_display_times`. Those make a page of plans take a second or more. Asking
 * only for what this app reads returned the same values several times faster (measured against
 * the live API on 2026-10-08, median of three):
 *
 * - A service type's plans from a day on: about 1.1 s to 0.2 s; with `include=plan_times`,
 *   2.5 s to 0.35 s.
 * - A plan's roster with `include=person,team,plan`: about 0.75 s to 0.32 s.
 * - A person's schedules with `include=plan_times`: about 1.2 to 1.8 s to 0.3 to 0.5 s.
 * - The team directory (`teams?include=people,...`): about 1.5 s to 0.5 s.
 *
 * A fieldset also drops every relationship it does not name, so each list names the
 * relationships its readers follow as well. A field left out is missing for every reader of
 * the response and every cache that holds it: add a field here before reading it.
 */

/**
 * Plans, as `toPlans`, plan window history (title, date, roster size, times, service type), and
 * the People activity ranges read them.
 */
const PLAN_FIELDS = [
  "title",
  "series_title",
  "sort_date",
  "created_at",
  "planning_center_url",
  "plan_people_count",
  "series",
  "service_type",
  "plan_times",
] as const;

/** Plan times sideloaded by `include=plan_times` (`planTimeResourceSchema` and history). */
const PLAN_TIME_FIELDS = ["name", "starts_at", "ends_at", "time_type"] as const;

/** A person's schedules, as `scheduleResourceSchema` and People activity read them. */
const SCHEDULE_FIELDS = [
  "status",
  "sort_date",
  "team_name",
  "team_position_name",
  "service_type_name",
  "decline_reason",
  "plan",
  "team",
  "service_type",
  "plan_person",
  "plan_times",
  "times",
] as const;

/**
 * People sideloaded on a plan roster or the team directory, as `rosterPersonSchema` and the
 * People roster read them.
 */
const PERSON_FIELDS = [
  "first_name",
  "last_name",
  "photo_url",
  "photo_thumbnail_url",
  "archived_at",
] as const;

const fieldsParams = (
  fields: Readonly<Record<string, readonly string[]>>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(fields).map(([type, names]) => [
      `fields[${type}]`,
      names.join(","),
    ])
  );

/** For reads of plans, with their sideloaded plan times when `include` asks for them. */
export const planFieldsParams = fieldsParams({
  Plan: PLAN_FIELDS,
  PlanTime: PLAN_TIME_FIELDS,
});

/** For a plan's roster with `include=person,team,plan`; plan people keep every field. */
export const planRosterFieldsParams = fieldsParams({
  Person: PERSON_FIELDS,
  Plan: PLAN_FIELDS,
});

/** For the team directory with `include=people,team_leaders,service_types`. */
export const teamDirectoryFieldsParams = fieldsParams({
  Person: PERSON_FIELDS,
});

/**
 * For a team position's assignments with `include=person,team_position`, whose people also
 * carry their plan limits (`personPlanLimitsSchema`).
 */
export const positionAssignmentFieldsParams = fieldsParams({
  Person: [
    ...PERSON_FIELDS,
    "preferred_max_plans_per_day",
    "preferred_max_plans_per_month",
  ],
});

/** For a person's schedules with `include=plan_times`. */
export const personScheduleFieldsParams = fieldsParams({
  Schedule: SCHEDULE_FIELDS,
  PlanTime: PLAN_TIME_FIELDS,
});
