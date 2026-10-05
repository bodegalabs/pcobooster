import { RpcError } from "@pcobooster/contracts/errors";
import {
  planItemSchema,
  planItemServicePositionSchema,
} from "@pcobooster/contracts/plan-item-schemas";
import { Schema, Struct } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

const requiredId = Schema.Trim.check(Schema.isMinLength(1));

const optionalText = Schema.optional(Schema.Trim);

const optionalNullableId = Schema.optional(Schema.NullOr(requiredId));

export const planItemsListInputSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
}).mapFields(Struct.map(Schema.mutableKey));

const itemFieldsSchema = Schema.Struct({
  title: optionalText,
  servicePosition: Schema.optional(planItemServicePositionSchema),
  length: Schema.optional(
    Schema.NullOr(
      Schema.Finite.check(Schema.isInt()).check(
        Schema.isGreaterThanOrEqualTo(0)
      )
    )
  ),
  description: optionalText,
  htmlDetails: optionalText,
  songId: optionalNullableId,
  arrangementId: optionalNullableId,
  keyId: optionalNullableId,
  selectedLayoutId: optionalNullableId,
  customArrangementSequence: Schema.optional(
    Schema.mutable(Schema.Array(requiredId))
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const planItemsCreateInputSchema = Schema.Struct({
  ...planItemsListInputSchema.fields,
  ...itemFieldsSchema.fields,
  itemType: Schema.optional(Schema.Literals(["header", "item"])),
}).mapFields(Struct.map(Schema.mutableKey));

export const planItemsUpdateInputSchema = Schema.Struct({
  ...planItemsListInputSchema.fields,
  ...itemFieldsSchema.fields,
  itemId: requiredId,
}).mapFields(Struct.map(Schema.mutableKey));

export const planItemsDeleteInputSchema = Schema.Struct({
  ...planItemsListInputSchema.fields,
  itemId: requiredId,
}).mapFields(Struct.map(Schema.mutableKey));

export const planItemsReorderInputSchema = Schema.Struct({
  ...planItemsListInputSchema.fields,
  sequence: Schema.mutable(Schema.Array(requiredId)).check(
    Schema.isMinLength(1)
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const planItemsListOutputSchema = Schema.mutable(
  Schema.Array(planItemSchema)
);

export const planItemsSuccessSchema = Schema.Struct({
  success: Schema.Literal(true),
}).mapFields(Struct.map(Schema.mutableKey));

export const planItemsRpc = RpcGroup.make(
  Rpc.make("planItems.list", {
    payload: planItemsListInputSchema,
    success: planItemsListOutputSchema,
    error: RpcError,
  }),
  Rpc.make("planItems.create", {
    payload: planItemsCreateInputSchema,
    success: planItemSchema,
    error: RpcError,
  }),
  Rpc.make("planItems.update", {
    payload: planItemsUpdateInputSchema,
    success: planItemSchema,
    error: RpcError,
  }),
  Rpc.make("planItems.delete", {
    payload: planItemsDeleteInputSchema,
    success: planItemsSuccessSchema,
    error: RpcError,
  }),
  Rpc.make("planItems.reorder", {
    payload: planItemsReorderInputSchema,
    success: planItemsSuccessSchema,
    error: RpcError,
  })
);

export type PlanItemsListInput = typeof planItemsListInputSchema.Encoded;

export type PlanItemsCreateInput = typeof planItemsCreateInputSchema.Encoded;

export type PlanItemsUpdateInput = typeof planItemsUpdateInputSchema.Encoded;

export type PlanItemsDeleteInput = typeof planItemsDeleteInputSchema.Encoded;

export type PlanItemsReorderInput = typeof planItemsReorderInputSchema.Encoded;
