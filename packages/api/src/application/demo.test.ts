import { startDemoSession } from "@pcobooster/api/application/demo";
import { Server } from "@pcobooster/api/server";
import { testServer, testServerConfig } from "@pcobooster/api/testing/server";
import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";

const accessKey = "a-private-demo-link-key-for-tests";
const enabled = testServerConfig({
  APP_ENV: "production",
  DEMO_ACCESS_KEY: accessKey,
  DEMO_PLANNING_CENTER_CLIENT: "demo-app",
  DEMO_PLANNING_CENTER_PAT: "demo-secret",
});

const start = async (key: string, config = enabled) =>
  await Effect.runPromise(
    Effect.result(
      Effect.provideService(
        startDemoSession({ key }),
        Server,
        testServer({ config })
      )
    )
  );

describe(startDemoSession, () => {
  it("exchanges the link key for a session token", async () => {
    await expect(start(accessKey)).resolves.toStrictEqual(
      Result.succeed({
        // HMAC-SHA256 of "pcobooster-demo-session-v1" keyed by `accessKey`, from openssl.
        sessionToken: "shqkCqn_RQEf_t-kLp0NvgzYlwCjf1ncZ98azsITlLY",
      })
    );
  });

  it("answers an unknown key and a disabled demo identically", async () => {
    const unknown = await start("guess");
    const disabled = await start(accessKey, testServerConfig());
    expect(unknown).toStrictEqual(disabled);
    expect(Result.getFailure(unknown)).toMatchObject({
      _tag: "Some",
      value: { _tag: "NotFound", resource: "demo" },
    });
  });
});
