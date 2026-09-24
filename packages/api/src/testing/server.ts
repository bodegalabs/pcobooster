import { resolveServerConfig } from "@pcobooster/api/config/server-config";
import type {
  ServerConfig,
  ServerEnvironment,
} from "@pcobooster/api/config/server-config";
import type { PlanningCenterPersonalAccessToken } from "@pcobooster/api/planning-center/core-client";
import type { ServerDependencies } from "@pcobooster/api/server";

/** Credentials that only ever reach mocked `fetch` calls. */
export const testPlanningCenterToken: PlanningCenterPersonalAccessToken = {
  applicationId: "test-client",
  secret: "test-token",
};

export const testServerEnvironment: ServerEnvironment = {
  NODE_ENV: "test",
  APP_ENV: "preview",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "pcobooster-unit-test-secret-with-no-production-access",
  PLANNING_CENTER_OAUTH_CLIENT_ID: "test-client",
  PLANNING_CENTER_OAUTH_CLIENT_SECRET: "test-client-secret",
};

export const testServerConfig = (
  environment: Partial<ServerEnvironment> = {}
): ServerConfig =>
  resolveServerConfig({ ...testServerEnvironment, ...environment });

/**
 * Server dependencies for unit tests. Config defaults to `testServerConfig()`; a test that
 * touches the database or Better Auth must supply them, so none starts them by accident.
 */
export const testServer = (
  overrides: Partial<ServerDependencies> = {}
): ServerDependencies => {
  const { config = testServerConfig(), database, auth } = overrides;
  return {
    config,
    get database() {
      if (database === undefined) {
        throw new Error("This test did not provide a database");
      }
      return database;
    },
    get auth() {
      if (auth === undefined) {
        throw new Error("This test did not provide Better Auth");
      }
      return auth;
    },
  };
};
