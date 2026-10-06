import {
  commitScheduledPerson,
  prepareScheduledPerson,
  removeScheduledPerson,
  updateScheduledPersonStatus,
} from "@pcobooster/api/application/schedule";
import { auditSchedule } from "@pcobooster/api/rpc/schedule-audit";
import type { ScheduleAuditDependencies } from "@pcobooster/api/rpc/schedule-audit";
import { preparedWrite } from "@pcobooster/api/rpc/write";
import { ProductApi } from "@pcobooster/contracts/http/api";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/** The audit row names the request's own method and path. */
const auditFor = (
  audit: ScheduleAuditDependencies,
  request: HttpServerRequest.HttpServerRequest
): ScheduleAuditDependencies => ({
  ...audit,
  path: new URL(request.url, "http://api").pathname,
});

/** Every schedule write is audited in D1 with its real outcome, method, and path. */
export const scheduleHandlers = (audit: ScheduleAuditDependencies = {}) =>
  HttpApiBuilder.group(ProductApi, "schedule", (handlers) =>
    handlers
      .handle("schedule.assign", ({ params, payload, request }) => {
        const input = { ...params, ...payload };
        return auditSchedule(
          "assign",
          input,
          preparedWrite(prepareScheduledPerson(input), (prepared) =>
            commitScheduledPerson(input, prepared)
          ),
          auditFor(audit, request)
        );
      })
      .handle("schedule.remove", ({ params, query, request }) => {
        const input = { ...params, ...query };
        return auditSchedule(
          "remove",
          input,
          removeScheduledPerson(input),
          auditFor(audit, request)
        );
      })
      .handle("schedule.updateStatus", ({ params, payload, request }) => {
        const input = { ...params, ...payload };
        return auditSchedule(
          "updateStatus",
          input,
          updateScheduledPersonStatus(input),
          auditFor(audit, request)
        );
      })
  );
