import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { NotFound } from "@pcobooster/api/application/errors/not-found";
import {
  demoSessionToken,
  isDemoAccessKey,
} from "@pcobooster/api/auth/demo-access";
import type { DemoConfiguration } from "@pcobooster/api/auth/demo-access";
import { Server } from "@pcobooster/api/server";
import type { DemoStartInput } from "@pcobooster/contracts/demo";
import { Effect } from "effect";

/**
 * Exchanges a demo link key for a session token. An unknown key and a
 * disabled demo look the same, so a probe learns nothing.
 */
export const startDemoSession = (
  input: DemoStartInput
): Effect.Effect<{ readonly sessionToken: string }, ApplicationFault, Server> =>
  Effect.gen(function* startDemo() {
    const configuration: DemoConfiguration | null = (yield* Server).config.demo;
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
