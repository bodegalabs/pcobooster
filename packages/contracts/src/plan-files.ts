import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
import { z } from "zod";

const id = z.string().regex(/^[\w-]+$/u);
export const planFilesInputSchema = z.object({
  serviceTypeId: id,
  planId: id,
  offset: z.number().int().nonnegative().max(100_000).default(0),
});
export const planFileSchema = z.object({
  id,
  name: z.string(),
  filename: z.string(),
  contentType: z.string(),
  fileType: z.string(),
  providerType: z.string(),
  size: z.number().nonnegative(),
  hasPreview: z.boolean(),
  downloadable: z.boolean(),
  streamable: z.boolean(),
  ownerType: z.string(),
  ownerId: z.string().nullable(),
});
export const planFileOpenInputSchema = planFilesInputSchema
  .omit({ offset: true })
  .extend({
    attachmentId: id,
    preview: z.boolean().default(false),
    pdf: z.boolean().default(false),
  });
const procedure = oc.errors({
  UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
  FORBIDDEN: applicationErrorMap.FORBIDDEN,
  TOO_MANY_REQUESTS: applicationErrorMap.TOO_MANY_REQUESTS,
  BAD_REQUEST: applicationErrorMap.BAD_REQUEST,
  BAD_GATEWAY: applicationErrorMap.BAD_GATEWAY,
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});
export const planFilesContract = {
  list: procedure
    .route({
      method: "GET",
      path: "/plan-files",
      summary: "Read a page of plan and song files",
    })
    .input(planFilesInputSchema)
    .output(
      z.object({
        files: z.array(planFileSchema),
        nextOffset: z.number().nullable(),
      })
    ),
  open: procedure
    .route({
      method: "POST",
      path: "/plan-files/open",
      summary: "Resolve a short-lived Planning Center file link",
    })
    .input(planFileOpenInputSchema)
    .output(
      z.object({
        url: z.url().startsWith("https://"),
        data: z.string().optional(),
        preview: z.boolean(),
      })
    ),
};
export type PlanFile = z.output<typeof planFileSchema>;
export type PlanFilesInput = z.output<typeof planFilesInputSchema>;
export type PlanFileOpenInput = z.output<typeof planFileOpenInputSchema>;
