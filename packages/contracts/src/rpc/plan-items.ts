/** Run-sheet item procedures over Effect RPC. Ported from the zod schemas in `../plan-items.ts`. */
import { planningCenterGroup } from "@pcobooster/contracts/rpc/group";
import {
  planItemSchema,
  planItemServicePositionSchema,
} from "@pcobooster/contracts/rpc/plan-item-schemas";
import { read, write } from "@pcobooster/contracts/rpc/procedure";
import {
  mutableArray,
  nonNegativeInteger,
  requiredId,
} from "@pcobooster/contracts/rpc/schema";
import { Schema } from "effect";

/** `z.string().trim().optional()`. */
const optionalText = Schema.optional(Schema.Trim);
/** `requiredId.nullish()`. */
const optionalNullableId = Schema.optional(Schema.NullOr(requiredId));

export const planItemsListInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
});

const itemFields = {
  title: optionalText,
  servicePosition: Schema.optional(planItemServicePositionSchema),
  length: Schema.optional(Schema.NullOr(nonNegativeInteger)),
  description: optionalText,
  htmlDetails: optionalText,
  songId: optionalNullableId,
  arrangementId: optionalNullableId,
  keyId: optionalNullableId,
  selectedLayoutId: optionalNullableId,
  customArrangementSequence: Schema.optional(mutableArray(requiredId)),
};

export const planItemsCreateInputSchema = Schema.Struct({
  ...planItemsListInputSchema.fields,
  ...itemFields,
  itemType: Schema.optional(Schema.Literals(["header", "item"])),
});

export const planItemsUpdateInputSchema = Schema.Struct({
  ...planItemsListInputSchema.fields,
  ...itemFields,
  itemId: requiredId,
});

export const planItemsDeleteInputSchema = Schema.Struct({
  ...planItemsListInputSchema.fields,
  itemId: requiredId,
});

export const planItemsReorderInputSchema = Schema.Struct({
  ...planItemsListInputSchema.fields,
  sequence: mutableArray(requiredId).check(Schema.isMinLength(1)),
});

export const planItemsSuccessSchema = Schema.Struct({
  success: Schema.Literal(true),
});

export const planItemsList = read("planItems.list", {
  payload: planItemsListInputSchema,
  success: mutableArray(planItemSchema),
});

/** A prepared write: reading the song and arrangement may stop; the create always finishes. */
export const planItemsCreate = write("planItems.create", {
  payload: planItemsCreateInputSchema,
  success: planItemSchema,
});

/** A prepared write, as `planItems.create`. */
export const planItemsUpdate = write("planItems.update", {
  payload: planItemsUpdateInputSchema,
  success: planItemSchema,
});

export const planItemsDelete = write("planItems.delete", {
  payload: planItemsDeleteInputSchema,
  success: planItemsSuccessSchema,
});

export const planItemsReorder = write("planItems.reorder", {
  payload: planItemsReorderInputSchema,
  success: planItemsSuccessSchema,
});

export const planItemsProcedures = [
  planItemsList,
  planItemsCreate,
  planItemsUpdate,
  planItemsDelete,
  planItemsReorder,
] as const;
export const planItemsRpc = planningCenterGroup(...planItemsProcedures);
