import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
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
});

export const accountsListInputSchema = z.object({});
export const accountsSelectInputSchema = z.object({
  accountId: z.string().trim().min(1),
});
export const accountSwitchSchema = z.object({
  success: z.literal(true),
  selectedAccountId: z.string(),
});

const accountsProcedure = oc.errors({
  UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});

export const accountsContract = {
  list: accountsProcedure
    .route({
      method: "GET",
      path: "/accounts",
      summary: "List the current user's linked Planning Center accounts",
    })
    .input(accountsListInputSchema)
    .output(planningCenterAccountsSchema),
  select: accountsProcedure
    .errors({ NOT_FOUND: applicationErrorMap.NOT_FOUND })
    .route({
      method: "POST",
      path: "/accounts/select",
      summary: "Select the current Planning Center account",
    })
    .input(accountsSelectInputSchema)
    .output(accountSwitchSchema),
};

export type PlanningCenterAccount = z.output<
  typeof planningCenterAccountSchema
>;
export type PlanningCenterAccountsResponse = z.output<
  typeof planningCenterAccountsSchema
>;
export type AccountsSelectInput = z.input<typeof accountsSelectInputSchema>;
