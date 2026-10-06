import { updateScheduledPersonStatus } from "@pcobooster/api/application/schedule";
import { auditSchedule } from "@pcobooster/api/rpc/schedule-audit";
import type { ScheduleAuditDependencies } from "@pcobooster/api/rpc/schedule-audit";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/** Every schedule write is audited in D1 with its real outcome, method, and path. */
export const scheduleHttpHandlers = (audit: ScheduleAuditDependencies = {}) =>
  HttpApiBuilder.group(ProductApi, "schedule", (handlers) =>
    handlers.handle("updateStatus", ({ params, payload, request }) => {
      const input = { ...params, ...payload };
      return auditSchedule(
        "updateStatus",
        input,
        updateScheduledPersonStatus(input),
        { ...audit, path: new URL(request.url, "http://api").pathname }
      );
    })
  );
