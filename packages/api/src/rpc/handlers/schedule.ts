import {
  commitScheduledPerson,
  prepareScheduledPerson,
} from "@pcobooster/api/application/schedule";
import { auditScheduleAssign } from "@pcobooster/api/rpc/schedule-audit";
import type { ScheduleAuditDependencies } from "@pcobooster/api/rpc/schedule-audit";
import { preparedWrite } from "@pcobooster/api/rpc/write";
import { scheduleRpc } from "@pcobooster/contracts/rpc/schedule";

export const scheduleHandlers = (audit: ScheduleAuditDependencies = {}) =>
  scheduleRpc.toLayer({
    "schedule.assign": (input) =>
      auditScheduleAssign(
        input,
        preparedWrite(prepareScheduledPerson(input), (prepared) =>
          commitScheduledPerson(input, prepared)
        ),
        audit
      ),
  });
