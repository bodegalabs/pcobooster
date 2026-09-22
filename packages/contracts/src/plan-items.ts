import { oc } from "@orpc/contract";
import { applicationErrorMap } from "@pcobooster/contracts/errors";
import {
  planItemSchema,
  planItemServicePositionSchema,
} from "@pcobooster/contracts/plan-item-schemas";
import { z } from "zod";

const requiredId = z.string().trim().min(1);
const optionalText = z.string().trim().optional();
const optionalNullableId = requiredId.nullish();

export const planItemsListInputSchema = z.object({
  serviceTypeId: requiredId,
  planId: requiredId,
});

const itemFieldsSchema = z.object({
  title: optionalText,
  servicePosition: planItemServicePositionSchema.optional(),
  length: z.number().int().nonnegative().nullable().optional(),
  description: optionalText,
  htmlDetails: optionalText,
  songId: optionalNullableId,
  arrangementId: optionalNullableId,
  keyId: optionalNullableId,
  selectedLayoutId: optionalNullableId,
  customArrangementSequence: z.array(requiredId).optional(),
});

export const planItemsCreateInputSchema = planItemsListInputSchema.extend({
  ...itemFieldsSchema.shape,
  itemType: z.enum(["header", "item"]).optional(),
});

export const planItemsUpdateInputSchema = planItemsListInputSchema.extend({
  ...itemFieldsSchema.shape,
  itemId: requiredId,
});

export const planItemsDeleteInputSchema = planItemsListInputSchema.extend({
  itemId: requiredId,
});

export const planItemsReorderInputSchema = planItemsListInputSchema.extend({
  sequence: z.array(requiredId).min(1),
});

export const planItemsListOutputSchema = z.array(planItemSchema);
export const planItemsSuccessSchema = z.object({ success: z.literal(true) });

const planItemsProcedure = oc.errors({
  UNAUTHORIZED: applicationErrorMap.UNAUTHORIZED,
  FORBIDDEN: applicationErrorMap.FORBIDDEN,
  TOO_MANY_REQUESTS: applicationErrorMap.TOO_MANY_REQUESTS,
  BAD_GATEWAY: applicationErrorMap.BAD_GATEWAY,
  INTERNAL_SERVER_ERROR: applicationErrorMap.INTERNAL_SERVER_ERROR,
});

export const planItemsContract = {
  list: planItemsProcedure
    .route({
      method: "GET",
      path: "/plan-items",
      summary: "List a plan's run-sheet items",
    })
    .input(planItemsListInputSchema)
    .output(planItemsListOutputSchema),
  create: planItemsProcedure
    .route({
      method: "POST",
      path: "/plan-items",
      summary: "Create a run-sheet item",
    })
    .input(planItemsCreateInputSchema)
    .output(planItemSchema),
  update: planItemsProcedure
    .route({
      method: "PATCH",
      path: "/plan-items/{itemId}",
      summary: "Update a run-sheet item",
    })
    .input(planItemsUpdateInputSchema)
    .output(planItemSchema),
  delete: planItemsProcedure
    .route({
      method: "DELETE",
      path: "/plan-items/{itemId}",
      summary: "Delete a run-sheet item",
    })
    .input(planItemsDeleteInputSchema)
    .output(planItemsSuccessSchema),
  reorder: planItemsProcedure
    .route({
      method: "POST",
      path: "/plan-items/reorder",
      summary: "Reorder a plan's run-sheet items",
    })
    .input(planItemsReorderInputSchema)
    .output(planItemsSuccessSchema),
};

export type PlanItemsListInput = z.input<typeof planItemsListInputSchema>;
export type PlanItemsCreateInput = z.input<typeof planItemsCreateInputSchema>;
export type PlanItemsUpdateInput = z.input<typeof planItemsUpdateInputSchema>;
export type PlanItemsDeleteInput = z.input<typeof planItemsDeleteInputSchema>;
export type PlanItemsReorderInput = z.input<typeof planItemsReorderInputSchema>;
