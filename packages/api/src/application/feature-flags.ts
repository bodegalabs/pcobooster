import type { RequestAuthentication } from "@pcobooster/api/application/planning-center-access";
import { anonymousFeatureFlagSubject } from "@pcobooster/api/modules/feature-flags/feature-flags";
import type { FeatureFlagSubject } from "@pcobooster/api/modules/feature-flags/feature-flags";

/** A demo visitor is anonymous; a signed-in user carries their selected account. */
export const featureFlagSubjectFor = (
  authentication: RequestAuthentication
): FeatureFlagSubject =>
  authentication.kind === "demo"
    ? anonymousFeatureFlagSubject
    : {
        userId: authentication.userId,
        planningCenterAccountId: authentication.accountId,
      };
