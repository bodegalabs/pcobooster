import { serviceTypeAbilities } from "@pcobooster/planning-center-models/access";
import type { PlanningCenterAccessSnapshot } from "@pcobooster/planning-center-models/access";
import type { PlanTimeType } from "@pcobooster/planning-center-models/types";

import { sharedReads, useProductClient } from "../../app-shell/queries";
import { useVisibleQuery as useQuery } from "../../app-shell/visible-queries";
import { planReads } from "./reads";

export const contentAccess = (
  snapshot: PlanningCenterAccessSnapshot | undefined,
  serviceTypeId: string,
  demo: boolean
) => {
  const abilities =
    snapshot === undefined
      ? null
      : serviceTypeAbilities(snapshot, serviceTypeId);
  const canEdit = !demo && (abilities === null || abilities.editPlans);
  const canChangeTime = (kind: PlanTimeType): boolean =>
    !demo &&
    (canEdit || (abilities?.scheduleLedTeams === true && kind !== "service"));
  let notice: string | null = null;
  if (demo) {
    notice = "Read-only demo. Changes are turned off here.";
  } else if (!canEdit) {
    notice = `Your Planning Center access here is ${abilities?.level ?? "limited"}. Editing the run sheet and service times needs Editor.`;
  }
  return {
    canEdit,
    canChangeTime,
    canAddTime: canChangeTime("rehearsal"),
    notice,
  };
};

export const useContentAccess = (serviceTypeId: string) => {
  const context = useProductClient();
  const access = useQuery(planReads.access(context));
  const accounts = useQuery(sharedReads.accounts(context));
  return contentAccess(
    access.data,
    serviceTypeId,
    accounts.data?.demo ?? false
  );
};
