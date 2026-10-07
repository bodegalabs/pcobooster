import { planningCenterIdentitySchema } from "@pcobooster/contracts/identity";
import { z } from "zod";

export const planningCenterAccountSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  updatedAt: z.string(),
  identity: planningCenterIdentitySchema.nullable(),
});

export const planningCenterAccountsSchema = z.object({
  session: z.object({
    userId: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
  }),
  selectedAccountId: z.string().nullable(),
  accounts: z.array(planningCenterAccountSchema),
  /** A read-only demo session backed by the demo organization. */
  demo: z.boolean(),
});

export const accountsListInputSchema = z.object({});
export const accountsSelectInputSchema = z.object({
  accountId: z.string().trim().min(1),
});
export const accountSwitchSchema = z.object({
  success: z.literal(true),
  selectedAccountId: z.string(),
});

export type PlanningCenterAccount = z.output<
  typeof planningCenterAccountSchema
>;
export type PlanningCenterAccountsResponse = z.output<
  typeof planningCenterAccountsSchema
>;
export type AccountsSelectInput = z.input<typeof accountsSelectInputSchema>;
