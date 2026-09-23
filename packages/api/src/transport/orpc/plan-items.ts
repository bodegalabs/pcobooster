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
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@pcobooster/api/transport/orpc/implementation";
import { executePreparedPlanningCenterWrite } from "@pcobooster/api/transport/orpc/planning-center-write";

const list = rpc.planItems.list.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(listPlanItems(input)),
      context,
      signal
    )
);

const create = rpc.planItems.create.handler(
  async ({ input, context, signal }) =>
    await executePreparedPlanningCenterWrite(
      applicationRuntime,
      context,
      signal,
      prepareRunSheetItemCreate(input),
      commitRunSheetItemCreate
    )
);

const update = rpc.planItems.update.handler(
  async ({ input, context, signal }) =>
    await executePreparedPlanningCenterWrite(
      applicationRuntime,
      context,
      signal,
      prepareRunSheetItemUpdate(input),
      commitRunSheetItemUpdate
    )
);

const deleteItem = rpc.planItems.delete.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(deleteRunSheetItem(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

const reorder = rpc.planItems.reorder.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
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
