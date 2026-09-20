import { z } from "zod";

export const planningCenterIdentitySchema = z.object({
  sub: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable(),
});

export type PlanningCenterIdentity = z.output<
  typeof planningCenterIdentitySchema
>;
