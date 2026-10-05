import { withPlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import {
  createRunSheetTime,
  deleteRunSheetTime,
  listPlanTimes,
  updateRunSheetPersonTimes,
  updateRunSheetTime,
} from "@pcobooster/api/application/run-sheet";
import { executeApplicationEffect } from "@pcobooster/api/transport/rpc/execute";
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";

const list = defineHandler(
  "planTimes.list",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(listPlanTimes(input)),
      context,
      signal
    )
);

const create = defineHandler(
  "planTimes.create",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(createRunSheetTime(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

const update = defineHandler(
  "planTimes.update",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      withPlanningCenterAccess(updateRunSheetTime(input)),
      context,
      signal,
      { interruptOnAbort: false }
    )
);

const deleteTime = defineHandler(
  "planTimes.delete",
  async ({ input, context, signal }): Promise<undefined> => {
    await executeApplicationEffect(
      withPlanningCenterAccess(deleteRunSheetTime(input)),
      context,
      signal,
      { interruptOnAbort: false }
    );
  }
);

const updatePersonTimes = defineHandler(
  "planPeople.updateTimes",
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
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
