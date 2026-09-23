import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { NotFound } from "@pcobooster/api/application/errors/not-found";
import {
  demoSessionToken,
  isDemoAccessKey,
  readDemoConfiguration,
} from "@pcobooster/api/auth/demo-access";
import type { DemoConfiguration } from "@pcobooster/api/auth/demo-access";
import type { DemoStartInput } from "@pcobooster/contracts/demo";
import { Effect } from "effect";

export interface DemoDependencies {
  readonly readConfiguration: () => DemoConfiguration | null;
}

const defaultDependencies: DemoDependencies = {
  readConfiguration: readDemoConfiguration,
};

/**
 * Exchanges a demo link key for a session token. An unknown key and a
 * disabled demo look the same, so a probe learns nothing.
 */
export const startDemoSession = (
  input: DemoStartInput,
  dependencies: DemoDependencies = defaultDependencies
): Effect.Effect<{ readonly sessionToken: string }, ApplicationFault> =>
  Effect.gen(function* startDemo() {
    const configuration = dependencies.readConfiguration();
    if (configuration === null || !isDemoAccessKey(configuration, input.key)) {
      return yield* Effect.fail(
        new NotFound({
          message: "This demo link isn't active.",
          resource: "demo",
        })
      );
    }
    return { sessionToken: demoSessionToken(configuration) };
  });
