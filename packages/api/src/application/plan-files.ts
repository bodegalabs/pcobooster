import {
  PlanningCenterAccess,
  withPlanningCenterFaults,
} from "@pcobooster/api/application/planning-center-access";
import { readFilePdf } from "@pcobooster/api/modules/planning-center/file-pdf";
import {
  listPlanFiles,
  openPlanFile,
} from "@pcobooster/api/modules/planning-center/plan-files";
import { PlanningCenterAttachmentsService } from "@pcobooster/api/planning-center/services/attachments-service";
import type {
  PlanFileOpenInput,
  PlanFilesInput,
} from "@pcobooster/contracts/plan-files";
import { Effect } from "effect";

export const readPlanFiles = (input: PlanFilesInput) =>
  Effect.gen(function* readFiles() {
    const access = yield* PlanningCenterAccess;
    return yield* listPlanFiles(
      input,
      new PlanningCenterAttachmentsService(access.services.core)
    );
  }).pipe(withPlanningCenterFaults);
export const resolvePlanFile = (input: PlanFileOpenInput) =>
  Effect.gen(function* resolveFile() {
    const access = yield* PlanningCenterAccess;
    const opened = yield* openPlanFile(
      input,
      new PlanningCenterAttachmentsService(access.services.core)
    );
    if (!input.pdf || opened.preview) {
      return opened;
    }
    const data = yield* readFilePdf(opened.url, globalThis.fetch);
    return { ...opened, data };
  }).pipe(withPlanningCenterFaults);
