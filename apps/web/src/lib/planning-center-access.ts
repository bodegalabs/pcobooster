import type {
  EnabledFeatures,
  FeatureFlagName,
} from "@pcobooster/contracts/features";
import type {
  AppFeature,
  FeatureAccess,
  ServiceTypeAbilities,
} from "@pcobooster/planning-center-models/access";
import { Schema } from "effect";

import type { DashboardView } from "@/lib/schedule-navigation";
import { storedJson } from "@/lib/stored-json";

/** The flag each flagged feature sits behind; the others are always in the product. */
const featureFlagOf: Readonly<Partial<Record<AppFeature, FeatureFlagName>>> = {
  peopleDashboard: "people",
  songs: "chordCharts",
};

/**
 * Leaves out features this visitor's flags hide, so the review never mentions them. Until the
 * flags answer, every flagged feature counts as hidden.
 */
export const visibleFeatureAccess = (
  features: readonly FeatureAccess[],
  enabled?: EnabledFeatures
): FeatureAccess[] =>
  features.filter((entry) => {
    const flag = featureFlagOf[entry.feature];
    return flag === undefined || enabled?.[flag] === true;
  });

/**
 * Identifies what the review showed. A new fingerprint means the person's access changed,
 * so the review opens again even after they dismissed it.
 */
export const accessFingerprint = (features: readonly FeatureAccess[]): string =>
  features
    .map((entry) => `${entry.feature}:${entry.availability}`)
    .toSorted()
    .join(",");

export const ACCESS_REVIEW_DISMISSALS_KEY =
  "pcobooster:access-review-dismissed:v1";

const storedDismissals = storedJson(
  Schema.Record(Schema.String, Schema.String)
);

/** The fingerprint each account last dismissed, keyed by account id. */
export const parseAccessReviewDismissals = (
  raw: string | null
): Record<string, string> => storedDismissals.parse(raw) ?? {};

export const recordAccessReviewDismissal = (
  raw: string | null,
  accountId: string,
  fingerprint: string
): string =>
  JSON.stringify({
    ...parseAccessReviewDismissals(raw),
    [accountId]: fingerprint,
  });

/** Opens the review once per account for access that limits something it can use. */
export const shouldPromptAccessReview = ({
  features,
  accountId,
  dismissalsRaw,
}: {
  features: readonly FeatureAccess[];
  accountId: string;
  dismissalsRaw: string | null;
}): boolean => {
  if (features.every((entry) => entry.availability === "full")) {
    return false;
  }
  return (
    parseAccessReviewDismissals(dismissalsRaw)[accountId] !==
    accessFingerprint(features)
  );
};

export interface PlanAccessMessage {
  readonly title: string;
  readonly description: string;
}

/** What the person can't change on this plan view, or null when nothing is held back. */
export const planAccessMessage = (
  view: DashboardView,
  abilities: ServiceTypeAbilities
): PlanAccessMessage | null => {
  const level = abilities.level ?? "limited";
  if (view === "assign") {
    if (abilities.scheduleAllTeams) {
      return null;
    }
    if (abilities.scheduleLedTeams) {
      return {
        title: "You can schedule only the teams you lead",
        description:
          "Scheduling other teams in this service type needs Editor access in Planning Center.",
      };
    }
    return {
      title: "View only",
      description: `Your Planning Center access here is ${level}. Scheduling needs Scheduler (for teams you lead) or Editor.`,
    };
  }
  if (abilities.editPlans) {
    return null;
  }
  if (view === "plan") {
    return {
      title: "View only",
      description: `Your Planning Center access here is ${level}. Editing the run sheet needs Editor.`,
    };
  }
  if (view === "times") {
    return abilities.scheduleLedTeams
      ? {
          title: "Service times need Editor",
          description:
            "You can add rehearsal and other times. Changing service times needs Editor access in Planning Center.",
        }
      : {
          title: "View only",
          description: `Your Planning Center access here is ${level}. Changing times needs Scheduler or Editor.`,
        };
  }
  return null;
};
