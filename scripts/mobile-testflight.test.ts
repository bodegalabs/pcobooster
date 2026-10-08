import { describe, expect, it } from "vitest";

import type { BuildState } from "../apps/mobile/scripts/release/asc";
import {
  runLocalRelease,
  withoutAppleKey,
} from "../apps/mobile/scripts/release/testflight";
import type {
  Checkout,
  LocalReleaseDependencies,
} from "../apps/mobile/scripts/release/testflight";
import { SHA, identityFor } from "./testing/ios-release-fixtures";

const ENV = {
  PATH: "/usr/bin",
  ASC_KEY_ID: "KEY123",
  ASC_ISSUER_ID: "issuer",
  ASC_KEY_P8_BASE64: "UEVN",
};
const OPTIONS = { env: ENV, timeoutMs: 3 * 60_000, intervalMs: 60_000 };
const ON_MAIN: Checkout = { head: SHA, originMain: SHA, dirty: false };

const stateOf = (processingState: string): BuildState => ({
  buildId: "b373",
  version: "373",
  shortVersion: "0.1.0",
  processingState,
  uploadedDate: null,
  expired: false,
  internalBuildState: null,
  externalBuildState: null,
  betaGroups: [],
});

interface Fake {
  readonly checkouts?: readonly Checkout[];
  readonly ascBuilds?: readonly number[];
  readonly confirmed?: boolean;
  readonly upload?: () => Promise<void>;
  readonly states?: readonly (BuildState | null)[];
}

/** A release whose every external step is recorded instead of run. */
const harness = (fake: Fake = {}) => {
  const calls: string[] = [];
  const envs: Record<string, Readonly<Record<string, string | undefined>>> = {};
  const checkouts = [...(fake.checkouts ?? [ON_MAIN, ON_MAIN])];
  const states = [...(fake.states ?? [null, stateOf("VALID")])];
  let clock = 0;
  const deps: LocalReleaseDependencies = {
    checkout: () => {
      calls.push("checkout");
      return checkouts.shift() ?? ON_MAIN;
    },
    run: (command, args, env) => {
      const name = [command, ...args].join(" ");
      calls.push(name);
      envs[name] = env;
    },
    exported: () => ({ build: 373, revision: SHA }),
    verifyExport: (build) => {
      calls.push(`verify ${build}`);
      return identityFor(build);
    },
    appStoreConnectBuilds: async (build) => {
      calls.push(`asc excluding own export ${build}`);
      return await Promise.resolve(fake.ascBuilds ?? [372]);
    },
    confirm: async () => {
      calls.push("confirm");
      return await Promise.resolve(fake.confirmed ?? true);
    },
    assertUnchanged: () => {
      calls.push("unchanged");
    },
    upload: async (identity) => {
      calls.push(`upload ${identity.build}`);
      await (fake.upload ?? (async () => {}))();
      return { deliveryId: null, outputSha256: "0".repeat(64) };
    },
    buildState: async () => {
      calls.push("status");
      return await Promise.resolve(states.shift() ?? null);
    },
    sleep: async (ms) => {
      clock += ms;
      await Promise.resolve();
    },
    now: () => new Date(clock),
    log: () => {},
  };
  return { deps, calls, envs };
};

describe("the local TestFlight release", () => {
  it("preflights, exports, verifies, rechecks, confirms, uploads once, and waits for VALID", async () => {
    const { deps, calls } = harness();
    await expect(runLocalRelease(deps, OPTIONS)).resolves.toMatchObject({
      build: 373,
      revision: SHA,
      status: "processed",
    });
    expect(calls).toStrictEqual([
      "checkout",
      "bun install --frozen-lockfile",
      "bun run ci",
      "bun run build",
      "bun run --cwd apps/mobile ios:release-smoke --build",
      "checkout",
      "bash apps/mobile/scripts/release-ios.sh --no-upload",
      "verify 373",
      "asc excluding own export 373",
      "confirm",
      "unchanged",
      "upload 373",
      "status",
      "status",
    ]);
  });

  it("keeps the Apple key from preflight and gives it only to the release script", async () => {
    const { deps, envs } = harness();
    await runLocalRelease(deps, OPTIONS);
    for (const step of ["bun run ci", "bun run build"]) {
      expect(envs[step]).toStrictEqual({ PATH: "/usr/bin" });
    }
    expect(
      envs["bash apps/mobile/scripts/release-ios.sh --no-upload"]
    ).toStrictEqual({ ...ENV, PCOB_RELEASE_SIGNING: "xcode-account" });
    expect(withoutAppleKey({ ...ENV, ASC_KEY_PATH: "/k.p8" })).toStrictEqual({
      PATH: "/usr/bin",
    });
  });

  it.each([
    [{ CI: "true" }, "marks this run as automation"],
    [{ BUILD_NUMBER: "380" }, "Unset BUILD_NUMBER"],
    [
      { ASC_KEY_ID: "", ASC_ISSUER_ID: "", ASC_KEY_P8_BASE64: "" },
      "Load the Keychain apple scope",
    ],
    [{ EXPO_PUBLIC_POSTHOG_KEY: "phc_other" }, "PostHog project key"],
  ])("refuses %j before touching anything", async (change, message) => {
    const { deps, calls } = harness();
    await expect(
      runLocalRelease(deps, { ...OPTIONS, env: { ...ENV, ...change } })
    ).rejects.toThrow(message);
    expect(calls).toStrictEqual([]);
  });

  it.each([
    [{ ...ON_MAIN, dirty: true }, "has changes before the release"],
    [{ ...ON_MAIN, head: "b".repeat(40) }, "is not origin/main"],
  ])("releases only a clean origin/main (%j)", async (checkout, message) => {
    const { deps, calls } = harness({ checkouts: [checkout] });
    await expect(runLocalRelease(deps, OPTIONS)).rejects.toThrow(message);
    expect(calls).toStrictEqual(["checkout"]);
  });

  it("stops when preflight leaves changes behind", async () => {
    const { deps, calls } = harness({
      checkouts: [ON_MAIN, { ...ON_MAIN, dirty: true }],
    });
    await expect(runLocalRelease(deps, OPTIONS)).rejects.toThrow(
      "has changes after preflight"
    );
    expect(calls).not.toContain(
      "bash apps/mobile/scripts/release-ios.sh --no-upload"
    );
  });

  it("never uploads a number App Store Connect took meanwhile", async () => {
    const { deps, calls } = harness({ ascBuilds: [373] });
    await expect(runLocalRelease(deps, OPTIONS)).rejects.toThrow(
      "Nothing was uploaded"
    );
    expect(calls.filter((call) => call.startsWith("upload"))).toStrictEqual([]);
  });

  it("uploads nothing unless the person confirms the build", async () => {
    const { deps, calls } = harness({ confirmed: false });
    await expect(runLocalRelease(deps, OPTIONS)).rejects.toThrow(
      "was not confirmed"
    );
    expect(calls.at(-1)).toBe("confirm");
  });

  it("reports a failed upload as unknown and never retries it", async () => {
    const { deps, calls } = harness({
      upload: async () => {
        await Promise.reject(new Error("altool exited 1"));
      },
    });
    await expect(runLocalRelease(deps, OPTIONS)).rejects.toThrow(
      "Never retry this number"
    );
    expect(calls.filter((call) => call.startsWith("upload"))).toStrictEqual([
      "upload 373",
    ]);
  });

  it("stops on failed processing, and calls a slow build unknown", async () => {
    const failed = harness({ states: [stateOf("INVALID")] });
    await expect(runLocalRelease(failed.deps, OPTIONS)).resolves.toMatchObject({
      status: "failed",
    });
    const slow = harness({ states: [] });
    await expect(runLocalRelease(slow.deps, OPTIONS)).resolves.toMatchObject({
      status: "unknown",
      state: null,
    });
    // Once a minute, from the upload until the three-minute deadline.
    expect(slow.calls.filter((call) => call === "status")).toHaveLength(4);
  });
});
