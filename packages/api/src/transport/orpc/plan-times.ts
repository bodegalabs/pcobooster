import { withPlanningCenterAccess } from "@worship-admin/api/application/planning-center-access";
import {
  createRunSheetTime,
  deleteRunSheetTime,
  listPlanTimes,
  updateRunSheetPersonTimes,
  updateRunSheetTime,
} from "@worship-admin/api/application/run-sheet";
import { executeApplicationEffect } from "@worship-admin/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@worship-admin/api/transport/orpc/implementation";

const list = rpc.planTimes.list.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(listPlanTimes(input)),
      context,
      signal
    )
);

const create = rpc.planTimes.create.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(createRunSheetTime(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

const update = rpc.planTimes.update.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(updateRunSheetTime(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

const deleteTime = rpc.planTimes.delete.handler(
  async ({ input, context, signal }) => {
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(deleteRunSheetTime(input)),
      context,
      signal,
      { interruptOnAbort: false }
    );
  }
);

const updatePersonTimes = rpc.planPeople.updateTimes.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(updateRunSheetPersonTimes(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

export const planTimesRouter = {
  list,
  create,
  update,
  delete: deleteTime,
};

export const planPeopleRouter = {
  updateTimes: updatePersonTimes,
};
