import {
  commitScheduledPerson,
  prepareScheduledPerson,
  removeScheduledPerson,
  updateScheduledPersonStatus,
} from "@pcobooster/api/application/schedule";
import { auditSchedule } from "@pcobooster/api/rpc/schedule-audit";
import type { ScheduleAuditDependencies } from "@pcobooster/api/rpc/schedule-audit";
import { preparedWrite } from "@pcobooster/api/rpc/write";
import { scheduleRpc } from "@pcobooster/contracts/rpc/schedule";

/** Every schedule write is audited in D1 with its real outcome. */
export const scheduleHandlers = (audit: ScheduleAuditDependencies = {}) =>
  scheduleRpc.toLayer({
    "schedule.assign": (input) =>
      auditSchedule(
        "assign",
        input,
        preparedWrite(prepareScheduledPerson(input), (prepared) =>
          commitScheduledPerson(input, prepared)
        ),
        audit
      ),
    "schedule.remove": (input) =>
      auditSchedule("remove", input, removeScheduledPerson(input), audit),
    "schedule.updateStatus": (input) =>
      auditSchedule(
        "updateStatus",
        input,
        updateScheduledPersonStatus(input),
        audit
      ),
  });
