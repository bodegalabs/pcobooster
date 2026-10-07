import {
  commitScheduledPerson,
  prepareScheduledPerson,
  removeScheduledPerson,
  updateScheduledPersonStatus,
} from "@pcobooster/api/application/schedule";
import { auditSchedule } from "@pcobooster/api/http/schedule-audit";
import type { ScheduleAuditDependencies } from "@pcobooster/api/http/schedule-audit";
import { preparedWrite } from "@pcobooster/api/http/write";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/** Every schedule write is audited in D1 with its real outcome, method, and path. */
export const scheduleHandlers = (audit: ScheduleAuditDependencies = {}) =>
  HttpApiBuilder.group(ProductApi, "schedule", (handlers) =>
    handlers
      .handle("assign", ({ params, payload }) => {
        const input = { ...params, ...payload };
        return auditSchedule(
          "assign",
          input,
          preparedWrite(prepareScheduledPerson(input), (prepared) =>
            commitScheduledPerson(input, prepared)
          ),
          audit
        );
      })
      .handle("remove", ({ params, query }) => {
        const input = { ...params, ...query };
        return auditSchedule(
          "remove",
          input,
          removeScheduledPerson(input),
          audit
        );
      })
      .handle("updateStatus", ({ params, payload }) => {
        const input = { ...params, ...payload };
        return auditSchedule(
          "updateStatus",
          input,
          updateScheduledPersonStatus(input),
          audit
        );
      })
  );
