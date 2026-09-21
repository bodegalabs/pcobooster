import { withPlanningCenterAccess } from "@worship-admin/api/application/planning-center-access";
import {
  commitRunSheetItemCreate,
  commitRunSheetItemUpdate,
  deleteRunSheetItem,
  listPlanItems,
  prepareRunSheetItemCreate,
  prepareRunSheetItemUpdate,
  reorderRunSheetItems,
} from "@worship-admin/api/application/run-sheet";
import { executeApplicationEffect } from "@worship-admin/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@worship-admin/api/transport/orpc/implementation";

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
  async ({ input, context, signal }) => {
    const prepared = await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(prepareRunSheetItemCreate(input)),
      context,
      signal
    );
    return await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(commitRunSheetItemCreate(prepared)),
      context,
      signal,
      { interruptOnAbort: false }
    );
  }
);

const update = rpc.planItems.update.handler(
  async ({ input, context, signal }) => {
    const prepared = await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(prepareRunSheetItemUpdate(input)),
      context,
      signal
    );
    return await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(commitRunSheetItemUpdate(prepared)),
      context,
      signal,
      { interruptOnAbort: false }
    );
  }
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
