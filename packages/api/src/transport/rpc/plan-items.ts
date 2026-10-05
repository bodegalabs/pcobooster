import { withPlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import {
  commitRunSheetItemCreate,
  commitRunSheetItemUpdate,
  deleteRunSheetItem,
  listPlanItems,
  prepareRunSheetItemCreate,
  prepareRunSheetItemUpdate,
  reorderRunSheetItems,
} from "@pcobooster/api/application/run-sheet";
import { executeApplicationEffect } from "@pcobooster/api/transport/rpc/execute";
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";
import { executePreparedPlanningCenterWrite } from "@pcobooster/api/transport/rpc/planning-center-write";

const list = defineHandler(
  "planItems.list",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(listPlanItems(input)),
      context,
      signal
    )
);

const create = defineHandler(
  "planItems.create",
  async ({ input, context, signal }) =>
    await executePreparedPlanningCenterWrite(
      context,
      signal,
      prepareRunSheetItemCreate(input),
      commitRunSheetItemCreate
    )
);

const update = defineHandler(
  "planItems.update",
  async ({ input, context, signal }) =>
    await executePreparedPlanningCenterWrite(
      context,
      signal,
      prepareRunSheetItemUpdate(input),
      commitRunSheetItemUpdate
    )
);

const deleteItem = defineHandler(
  "planItems.delete",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(deleteRunSheetItem(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

const reorder = defineHandler(
  "planItems.reorder",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(reorderRunSheetItems(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

export const planItemsRouter = {
  list,
  create,
  update,
  delete: deleteItem,
  reorder,
};
