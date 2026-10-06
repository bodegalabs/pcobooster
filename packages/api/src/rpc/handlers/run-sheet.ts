import { adjustPlanNeededPositions } from "@pcobooster/api/application/needed-positions";
import {
  commitRunSheetItemCreate,
  commitRunSheetItemUpdate,
  createRunSheetTime,
  deleteRunSheetItem,
  deleteRunSheetTime,
  listPlanItems,
  listPlanTimes,
  prepareRunSheetItemCreate,
  prepareRunSheetItemUpdate,
  reorderRunSheetItems,
  updateRunSheetPersonTimes,
  updateRunSheetTime,
} from "@pcobooster/api/application/run-sheet";
import { preparedWrite } from "@pcobooster/api/rpc/write";
import { neededPositionsRpc } from "@pcobooster/contracts/rpc/needed-positions";
import { planItemsRpc } from "@pcobooster/contracts/rpc/plan-items";
import { planPeopleRpc } from "@pcobooster/contracts/rpc/plan-people";
import { planTimesRpc } from "@pcobooster/contracts/rpc/plan-times";
import { Layer } from "effect";

/** The plan page's run sheet: items, times, people's times, and open positions. */
export const RunSheetHandlers = Layer.mergeAll(
  planItemsRpc.toLayer({
    "planItems.list": listPlanItems,
    "planItems.create": (input) =>
      preparedWrite(prepareRunSheetItemCreate(input), commitRunSheetItemCreate),
    "planItems.update": (input) =>
      preparedWrite(prepareRunSheetItemUpdate(input), commitRunSheetItemUpdate),
    "planItems.delete": deleteRunSheetItem,
    "planItems.reorder": reorderRunSheetItems,
  }),
  planTimesRpc.toLayer({
    "planTimes.list": listPlanTimes,
    "planTimes.create": createRunSheetTime,
    "planTimes.update": updateRunSheetTime,
    "planTimes.delete": deleteRunSheetTime,
  }),
  planPeopleRpc.toLayer({
    "planPeople.updateTimes": updateRunSheetPersonTimes,
  }),
  neededPositionsRpc.toLayer({
    "neededPositions.adjust": adjustPlanNeededPositions,
  })
);
