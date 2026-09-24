import type {
  Flagship,
  FlagshipEvaluationContext,
} from "@cloudflare/workers-types";
import { featureFlags } from "@pcobooster/api/config/feature-flags";
import type {
  DeploymentTier,
  FeatureFlagName,
} from "@pcobooster/api/config/feature-flags";
import { Effect } from "effect";

/** Who a flag is evaluated for. Null when the request has no signed-in user or account. */
export interface FeatureFlagSubject {
  readonly userId: string | null;
  /** The Better Auth account ID of the selected Planning Center account. */
  readonly planningCenterAccountId: string | null;
}

export const anonymousFeatureFlagSubject: FeatureFlagSubject = {
  userId: null,
  planningCenterAccountId: null,
};

/** Evaluates the flags in `config/feature-flags.ts`. Never fails: errors resolve to off. */
export interface FeatureFlags {
  readonly isEnabled: (
    flag: FeatureFlagName,
    subject: FeatureFlagSubject
  ) => Effect.Effect<boolean>;
}

/** The part of the Worker's Flagship binding the API uses. */
export type FlagshipBinding = Pick<Flagship, "getBooleanDetails">;

export interface FeatureFlagFailure {
  readonly flag: FeatureFlagName;
  readonly key: string;
  /** Flagship's error code, or `EVALUATION_THREW` / `ORGANIZATION_LOOKUP_FAILED`. */
  readonly errorCode: string;
  readonly message: string;
  readonly cause: Error | null;
}

export interface FlagshipFeatureFlagDependencies {
  readonly flagship: FlagshipBinding;
  /** The Planning Center organization of a Better Auth account, when recorded at sign-in. */
  readonly resolveOrganizationId: (
    planningCenterAccountId: string
  ) => Promise<string | null>;
  /** Receives each problem during an evaluation, so the Worker can log it. */
  readonly reportFailure: (failure: FeatureFlagFailure) => void;
}

/**
 * Evaluates through Cloudflare Flagship. Targeting rules can match `userId` and
 * `organizationId` (the Planning Center organization); percentage rollouts bucket by
 * `targetingKey`, the user ID. Evaluation errors, including an unknown flag, serve off.
 */
export const createFlagshipFeatureFlags = ({
  flagship,
  resolveOrganizationId,
  reportFailure,
}: FlagshipFeatureFlagDependencies): FeatureFlags => {
  const organizationIdFor = async (
    flag: FeatureFlagName,
    accountId: string
  ): Promise<string | null> => {
    try {
      return await resolveOrganizationId(accountId);
    } catch (error) {
      // The flag still evaluates for the user; only organization targeting is lost.
      const cause = error instanceof Error ? error : new Error(String(error));
      reportFailure({
        flag,
        key: featureFlags[flag].key,
        errorCode: "ORGANIZATION_LOOKUP_FAILED",
        message: cause.message,
        cause,
      });
      return null;
    }
  };

  const evaluate = async (
    flag: FeatureFlagName,
    subject: FeatureFlagSubject
  ): Promise<boolean> => {
    const { key } = featureFlags[flag];
    const context: FlagshipEvaluationContext = {};
    if (subject.userId !== null) {
      context.targetingKey = subject.userId;
      context.userId = subject.userId;
    }
    if (subject.planningCenterAccountId !== null) {
      const organizationId = await organizationIdFor(
        flag,
        subject.planningCenterAccountId
      );
      if (organizationId !== null) {
        context.organizationId = organizationId;
      }
    }
    try {
      const details = await flagship.getBooleanDetails(key, false, context);
      if (details.errorCode === undefined) {
        return details.value;
      }
      reportFailure({
        flag,
        key,
        errorCode: details.errorCode,
        message: details.errorMessage ?? "Flag evaluation failed",
        cause: null,
      });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      reportFailure({
        flag,
        key,
        errorCode: "EVALUATION_THREW",
        message: cause.message,
        cause,
      });
    }
    return false;
  };

  return {
    isEnabled: (flag, subject) =>
      Effect.promise(async () => await evaluate(flag, subject)),
  };
};

/**
 * Serves each flag's registry value for one tier, with no Flagship binding. The local stage
 * uses it because `alchemy dev` has no local Flagship emulator.
 */
export const createRegistryFeatureFlags = (
  tier: DeploymentTier
): FeatureFlags => ({
  isEnabled: (flag) => Effect.succeed(featureFlags[flag].enabled[tier]),
});
