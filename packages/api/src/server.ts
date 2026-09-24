import type { D1Database } from "@cloudflare/workers-types";
import { createAuth } from "@pcobooster/api/auth";
import type { Auth } from "@pcobooster/api/auth";
import type { DeploymentTier } from "@pcobooster/api/config/feature-flags";
import type { ServerConfig } from "@pcobooster/api/config/server-config";
import { createDatabase } from "@pcobooster/api/db/client";
import type { Db } from "@pcobooster/api/db/client";
import { logger } from "@pcobooster/api/logger";
import { getPlanningCenterAccountIdentity } from "@pcobooster/api/modules/admin/planning-center-account-identities";
import {
  createFlagshipFeatureFlags,
  createRegistryFeatureFlags,
} from "@pcobooster/api/modules/feature-flags/feature-flags";
import type {
  FeatureFlags,
  FlagshipBinding,
} from "@pcobooster/api/modules/feature-flags/feature-flags";
import { createPlanningCenterReadCaches } from "@pcobooster/api/planning-center/services/factory";
import type { PlanningCenterReadCaches } from "@pcobooster/api/planning-center/services/factory";
import type { SharedReadStore } from "@pcobooster/api/planning-center/services/shared-read-store";
import { Context } from "effect";

/** Built once per Worker isolate and shared by every request it serves. */
export interface ServerDependencies {
  readonly config: ServerConfig;
  readonly database: Db;
  readonly auth: Auth;
  readonly featureFlags: FeatureFlags;
  readonly planningCenterReadCaches: PlanningCenterReadCaches;
}

export class Server extends Context.Service<Server, ServerDependencies>()(
  "@pcobooster/api/Server"
) {}

/**
 * Where flag values come from: the stage's Cloudflare Flagship app, or (local stage only,
 * which has no Flagship emulator) the registry's values for a tier.
 */
export type FeatureFlagSource =
  | { readonly kind: "flagship"; readonly binding: FlagshipBinding }
  | { readonly kind: "registry"; readonly tier: DeploymentTier };

const featureFlagLog = logger.for("feature-flags");
const readCacheLog = logger.for("planning-center-cache");

const createFeatureFlags = (
  source: FeatureFlagSource,
  database: Db
): FeatureFlags =>
  source.kind === "registry"
    ? createRegistryFeatureFlags(source.tier)
    : createFlagshipFeatureFlags({
        flagship: source.binding,
        resolveOrganizationId: async (accountId) => {
          const identity = await getPlanningCenterAccountIdentity(
            accountId,
            database
          );
          return identity?.organizationId ?? null;
        },
        reportFailure: ({ cause, ...failure }) => {
          featureFlagLog.error(
            { ...failure, err: cause },
            "Feature flag evaluation failed; serving off"
          );
        },
      });

export const createServerDependencies = (
  config: ServerConfig,
  binding: D1Database,
  featureFlagSource: FeatureFlagSource,
  /** The shared Planning Center read tier every isolate reads through. */
  planningCenterReadStore: SharedReadStore
): ServerDependencies => {
  const database = createDatabase(binding);
  return {
    config,
    database,
    auth: createAuth(config, database),
    featureFlags: createFeatureFlags(featureFlagSource, database),
    planningCenterReadCaches: createPlanningCenterReadCaches({
      store: planningCenterReadStore,
      reportError: (message, error) => {
        readCacheLog.warn({ err: error }, message);
      },
    }),
  };
};
