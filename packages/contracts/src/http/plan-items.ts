/** The run sheet's items. */
import { read, write } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import {
  planItemSchema,
  planItemServicePositionSchema,
} from "@pcobooster/contracts/http/plan-item-schemas";
import {
  mutableArray,
  nonNegativeInteger,
  requiredId,
} from "@pcobooster/contracts/http/schema";
import { Struct, Schema } from "effect";

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

const ITEMS = "/service-types/:serviceTypeId/plans/:planId/items";
const PLAN = ["serviceTypeId", "planId"] as const;
const ITEM = ["serviceTypeId", "planId", "itemId"] as const;

export const planItems = planningCenterGroup(
  "planItems",
  read("planItems.list", ITEMS, {
    params: planItemsListInputSchema.fields,
    query: {},
    success: mutableArray(planItemSchema),
  }),
  /** A prepared write: reading the song and arrangement may stop; the create always finishes. */
  write.post("planItems.create", ITEMS, {
    params: Struct.pick(planItemsCreateInputSchema.fields, PLAN),
    payload: Struct.omit(planItemsCreateInputSchema.fields, PLAN),
    success: planItemSchema,
  }),
  /** A prepared write, as `planItems.create`. */
  write.patch("planItems.update", `${ITEMS}/:itemId`, {
    params: Struct.pick(planItemsUpdateInputSchema.fields, ITEM),
    payload: Struct.omit(planItemsUpdateInputSchema.fields, ITEM),
    success: planItemSchema,
  }),
  write.delete("planItems.delete", `${ITEMS}/:itemId`, {
    params: planItemsDeleteInputSchema.fields,
    query: {},
    success: planItemsSuccessSchema,
  }),
  /** Sets the whole order; `order` is fixed text, never an item id. */
  write.put("planItems.reorder", `${ITEMS}/order`, {
    params: Struct.pick(planItemsReorderInputSchema.fields, PLAN),
    payload: Struct.omit(planItemsReorderInputSchema.fields, PLAN),
    success: planItemsSuccessSchema,
  })
);
