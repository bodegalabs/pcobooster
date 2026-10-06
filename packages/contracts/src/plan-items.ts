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

export type PlanItemsListInput = z.input<typeof planItemsListInputSchema>;
export type PlanItemsCreateInput = z.input<typeof planItemsCreateInputSchema>;
export type PlanItemsUpdateInput = z.input<typeof planItemsUpdateInputSchema>;
export type PlanItemsDeleteInput = z.input<typeof planItemsDeleteInputSchema>;
export type PlanItemsReorderInput = z.input<typeof planItemsReorderInputSchema>;
