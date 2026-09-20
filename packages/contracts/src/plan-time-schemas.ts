import { z } from "zod";

export const planTimeTypeSchema = z.enum(["service", "rehearsal", "other"]);

export const planTimeSchema = z.object({
  startsAt: z.date(),
  endsAt: z.date().nullable(),
  id: z.string(),
  name: z.string(),
  timeType: planTimeTypeSchema,
  teamReminders: z.json(),
  assignedTeamIds: z.array(z.string()),
  assignedPositionIds: z.array(z.string()),
  splitTeamRehearsalAssignmentIds: z.array(z.string()),
});

export type PlanTimeType = z.output<typeof planTimeTypeSchema>;
export type PlanTime = z.output<typeof planTimeSchema>;
