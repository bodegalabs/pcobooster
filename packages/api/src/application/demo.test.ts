import { startDemoSession } from "@pcobooster/api/application/demo";
import type { DemoDependencies } from "@pcobooster/api/application/demo";
import {
  demoSessionToken,
  readDemoConfiguration,
} from "@pcobooster/api/auth/demo-access";
import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";

const accessKey = "a-private-demo-link-key-for-tests";
const configuration = readDemoConfiguration({
  DEMO_ACCESS_KEY: accessKey,
  DEMO_PLANNING_CENTER_CLIENT: "demo-app",
  DEMO_PLANNING_CENTER_PAT: "demo-secret",
});
const configuredDependencies: DemoDependencies = {
  readConfiguration: () => configuration,
};

const start = async (key: string, dependencies: DemoDependencies) =>
  await Effect.runPromise(
    Effect.result(startDemoSession({ key }, dependencies))
  );

describe(startDemoSession, () => {
  it("exchanges the link key for a session token", async () => {
    if (configuration === null) {
      throw new Error("Expected a demo configuration");
    }
    await expect(
      start(accessKey, configuredDependencies)
    ).resolves.toStrictEqual(
      Result.succeed({ sessionToken: demoSessionToken(configuration) })
    );
  });

  it("answers an unknown key and a disabled demo identically", async () => {
    const unknown = await start("guess", configuredDependencies);
    const disabled = await start(accessKey, { readConfiguration: () => null });
    expect(unknown).toStrictEqual(disabled);
    expect(Result.getFailure(unknown)).toMatchObject({
      _tag: "Some",
      value: { _tag: "NotFound", resource: "demo" },
    });
  });
});
