import { hasServicesLevel } from "@pcobooster/planning-center-models/access";
import type { PlanningCenterAccessSnapshot } from "@pcobooster/planning-center-models/access";

export type ChordChartEditAccess =
  | { readonly canEdit: true }
  | {
      readonly canEdit: false;
      /** Why the chart is view-only, written for the person. */
      readonly reason: string;
    };

const EDITABLE: ChordChartEditAccess = { canEdit: true };

/**
 * Whether the person may save chord charts. Only a known song permission below Editor (or the
 * read-only demo) makes the editor view-only; while permissions load, or when Planning Center
 * doesn't report a song level, editing stays open and Planning Center has the final say.
 */
export const chordChartEditAccess = (
  snapshot: PlanningCenterAccessSnapshot | null,
  demo: boolean
): ChordChartEditAccess => {
  if (demo) {
    return {
      canEdit: false,
      reason: "This demo is read-only, so changes aren’t saved.",
    };
  }
  if (snapshot === null) {
    return EDITABLE;
  }
  const { services } = snapshot;
  if (services.status === "none") {
    return {
      canEdit: false,
      reason: "Your Planning Center account can’t edit songs in Services.",
    };
  }
  if (services.organizationAdministrator || services.songLevel === null) {
    return EDITABLE;
  }
  if (hasServicesLevel(services.songLevel, "Editor")) {
    return EDITABLE;
  }
  return {
    canEdit: false,
    reason: `Your song access in Planning Center is ${services.songLevel}. Saving chord charts needs Editor.`,
  };
};
