import type {
  EnabledFeatures,
  FeatureFlagName,
} from "@pcobooster/contracts/features";
import {
  deriveFeatureAccess,
  hasRestrictedAccess,
} from "@pcobooster/planning-center-models/access";
import type {
  AppFeature,
  FeatureAccess,
  PlanningCenterAccessSnapshot,
} from "@pcobooster/planning-center-models/access";

/** The flag each flagged feature sits behind; the others are always in the product. */
const featureFlagOf: Readonly<Partial<Record<AppFeature, FeatureFlagName>>> = {
  peopleDashboard: "people",
  songs: "chordCharts",
};

export interface AccessReview {
  /** `loading` until `access.me` answers; `failed` when it could not be read. */
  readonly status: "loading" | "ready" | "failed";
  /** Features this build shows (flags applied), with what this person can do in each. */
  readonly features: readonly FeatureAccess[];
  /** Anything is less than fully available; false until access is known. */
  readonly isRestricted: boolean;
}

/**
 * The access review for the current account (the web's `usePlanningCenterAccess`, Swift
 * `AccessReview`): features hidden by flags are left out, and until the flags answer every
 * flagged feature counts as hidden.
 */
export const accessReview = (
  snapshot: PlanningCenterAccessSnapshot | undefined,
  failed: boolean,
  enabled: EnabledFeatures | undefined
): AccessReview => {
  if (snapshot === undefined) {
    return {
      status: failed ? "failed" : "loading",
      features: [],
      isRestricted: false,
    };
  }
  const features = deriveFeatureAccess(snapshot).filter((entry) => {
    const flag = featureFlagOf[entry.feature];
    return flag === undefined || enabled?.[flag] === true;
  });
  return {
    status: "ready",
    features,
    isRestricted: hasRestrictedAccess(features),
  };
};
