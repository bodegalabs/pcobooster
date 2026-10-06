/** The run sheet's items. */
import { read, write } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import { planItemSchema } from "@pcobooster/contracts/rpc/plan-item-schemas";
import {
  planItemsCreateInputSchema,
  planItemsDeleteInputSchema,
  planItemsListInputSchema,
  planItemsReorderInputSchema,
  planItemsSuccessSchema,
  planItemsUpdateInputSchema,
} from "@pcobooster/contracts/rpc/plan-items";
import { mutableArray } from "@pcobooster/contracts/rpc/schema";
import { Struct } from "effect";

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
