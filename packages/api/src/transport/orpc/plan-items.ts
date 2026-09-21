import { withPlanningCenterAccess } from "@worship-admin/api/application/planning-center-access";
import {
  createRunSheetItem,
  deleteRunSheetItem,
  listPlanItems,
  reorderRunSheetItems,
  updateRunSheetItem,
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
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(createRunSheetItem(input)),
      context,
      signal
    )
);

const update = rpc.planItems.update.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(updateRunSheetItem(input)),
      context,
      signal
    )
);

const deleteItem = rpc.planItems.delete.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(deleteRunSheetItem(input)),
      context,
      signal
    )
);

const reorder = rpc.planItems.reorder.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(reorderRunSheetItems(input)),
      context,
      signal
    )
);

export const planItemsRouter = {
  list,
  create,
  update,
  delete: deleteItem,
  reorder,
};
