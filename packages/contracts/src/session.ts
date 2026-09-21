import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@worship-admin/contracts/errors";
import { z } from "zod";

export const sessionStatusInputSchema = z.object({});
export const sessionStatusSchema = z.object({ authenticated: z.boolean() });

export const sessionContract = {
  status: oc
    .errors({
      INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
    })
    .route({
      method: "GET",
      path: "/session",
      summary: "Report whether the current session is authenticated",
    })
    .input(sessionStatusInputSchema)
    .output(sessionStatusSchema),
};

export type SessionStatus = z.output<typeof sessionStatusSchema>;
