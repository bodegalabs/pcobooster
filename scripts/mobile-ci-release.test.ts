import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { describe, expect, it, onTestFinished } from "vitest";

import type { BuildState } from "../apps/mobile/scripts/release/asc";
import {
  deliveryId,
  makeAltoolUploader,
  runIdentityFromEnv,
  withPrivateKeyFile,
} from "../apps/mobile/scripts/release/ci-adapters";
import {
  BLOCKED_MESSAGE,
  RELEASE_ENABLEMENT,
  UploadOutcomeUnknownError,
  assertReleaseEnabled,
  awaitProcessing,
  reconcile,
  runRelease,
} from "../apps/mobile/scripts/release/ci-release";
import type { ReleaseDependencies } from "../apps/mobile/scripts/release/ci-release";
import type { CommandResult } from "../apps/mobile/scripts/release/signed-export";
import { sha256 } from "../apps/mobile/scripts/source-maps";
import {
  AT,
  BUNDLE,
  SHA,
  VERSION,
  failingUpload,
  harness,
  identityFor,
  memoryLedger,
  requestOf,
  runOf,
} from "./testing/ios-release-fixtures";
import type {
  FakeAppStoreConnect,
  Fault,
  MemoryLedger,
} from "./testing/ios-release-fixtures";

describe("the sole release executor", () => {
  it("claims before archiving and uploads exactly once, after rechecking", async () => {
    const ledger = memoryLedger();
    const { deps, calls } = harness(ledger.store);
    await expect(runRelease(deps, requestOf())).resolves.toMatchObject({
      build: 373,
    });
    expect(calls).toStrictEqual([
      "preflight",
      "asc",
      "archive 373",
      "export 373",
      "verify 373",
      "symbols",
      "asc",
      "unchanged",
      "unchanged",
      "upload 373",
    ]);
  });

  it("records each stage durably", async () => {
    const ledger = memoryLedger();
    await runRelease(harness(ledger.store).deps, requestOf());
    expect(ledger.states()).toStrictEqual([
      "373 claimed",
      "373 verified",
      "373 upload_started",
      "373 upload_accepted",
    ]);
  });

  it("keeps every prior number across fresh runners, even ones App Store Connect never saw", async () => {
    const ledger = memoryLedger();
    const archiveFails = harness(ledger.store, {
      archive: async () => {
        await Promise.reject(new Error("xcodebuild archive failed"));
      },
    });
    await expect(
      runRelease(archiveFails.deps, requestOf("1001"))
    ).rejects.toThrow("archive failed");
    const uploadLost = harness(ledger.store, {
      upload: failingUpload("altool: connection lost"),
    });
    await expect(
      runRelease(uploadLost.deps, requestOf("1002"))
    ).rejects.toThrow(UploadOutcomeUnknownError);
    await expect(
      runRelease(harness(ledger.store).deps, requestOf("1003"))
    ).resolves.toMatchObject({ build: 375 });
    expect(
      ledger.states().filter((state) => !state.includes("verified"))
    ).toStrictEqual([
      "373 claimed",
      "373 abandoned",
      "374 claimed",
      "374 upload_started",
      "375 claimed",
      "375 upload_started",
      "375 upload_accepted",
    ]);
  });

  it("allocates above App Store Connect builds and in-flight uploads newer than the ledger", async () => {
    const { deps } = harness(memoryLedger().store, {}, { builds: [372, 380] });
    await expect(runRelease(deps, requestOf())).resolves.toMatchObject({
      build: 381,
    });
  });

  it("is blocked in source, before any credential or ledger access", () => {
    expect(RELEASE_ENABLEMENT).toBe("blocked");
    expect(() => {
      assertReleaseEnabled();
    }).toThrow(BLOCKED_MESSAGE);
    expect(() => {
      assertReleaseEnabled("approved");
    }).not.toThrow();
  });
});

describe("before an upload starts", () => {
  it("does not archive when the claim never landed", async () => {
    const ledger = memoryLedger();
    ledger.faults.set("claimed", "before-write");
    const { deps, calls } = harness(ledger.store);
    await expect(runRelease(deps, requestOf())).rejects.toThrow("network down");
    expect(calls).not.toContain("archive 373");
    expect(ledger.states()).toStrictEqual([]);
  });

  it("does not archive after an ambiguous claim, and the next run stays above it", async () => {
    const ledger = memoryLedger();
    ledger.faults.set("claimed", "after-write");
    const ambiguous = harness(ledger.store);
    await expect(runRelease(ambiguous.deps, requestOf("1001"))).rejects.toThrow(
      "after the write landed"
    );
    expect(ambiguous.calls).not.toContain("archive 373");
    await expect(
      runRelease(harness(ledger.store).deps, requestOf("1002"))
    ).resolves.toMatchObject({ build: 374 });
  });

  it("claims nothing from an unreadable ledger", async () => {
    const { deps, calls } = harness(memoryLedger("{broken\n").store);
    await expect(runRelease(deps, requestOf())).rejects.toThrow("unreadable");
    expect(calls).toStrictEqual(["preflight"]);
  });

  it("claims nothing when App Store Connect cannot be read", async () => {
    const ledger = memoryLedger();
    const { deps } = harness(ledger.store, {
      appStoreConnectBuilds: async () =>
        await Promise.reject(new Error("App Store Connect answered 401")),
    });
    await expect(runRelease(deps, requestOf())).rejects.toThrow("401");
    expect(ledger.states()).toStrictEqual([]);
  });

  it("claims nothing when the source or smoke evidence is stale", async () => {
    const ledger = memoryLedger();
    const { deps, calls } = harness(ledger.store, {
      preflight: async () => {
        await Promise.reject(new Error("not the clean dispatched revision"));
      },
    });
    await expect(runRelease(deps, requestOf())).rejects.toThrow("dispatched");
    expect(calls).toStrictEqual([]);
    expect(ledger.states()).toStrictEqual([]);
  });

  const abandons: {
    name: string;
    overrides: Partial<ReleaseDependencies>;
    expected: string;
  }[] = [
    {
      name: "changed maps or IPA at verification",
      overrides: {
        verifyExport: async () =>
          await Promise.reject(new Error("Source maps do not match the IPA")),
      },
      expected: "Source maps do not match",
    },
    {
      name: "an IPA changed after verification",
      overrides: {
        assertUnchanged: async () => {
          await Promise.reject(
            new Error("The IPA or release manifest changed")
          );
        },
      },
      expected: "manifest changed",
    },
    {
      name: "artifacts from another revision",
      overrides: {
        verifyExport: async (build) =>
          await Promise.resolve({
            ...identityFor(build),
            sourceSha: "b".repeat(40),
          }),
      },
      expected: "different app, version, build, or revision",
    },
  ];

  it.each(abandons)(
    "abandons the burned number without uploading for $name",
    async ({ overrides, expected }) => {
      const ledger = memoryLedger();
      const { deps, uploads } = harness(ledger.store, overrides);
      await expect(runRelease(deps, requestOf())).rejects.toThrow(expected);
      expect(uploads()).toStrictEqual([]);
      expect(ledger.states().at(-1)).toBe("373 abandoned");
    }
  );

  it("does not upload when App Store Connect gained this number or a higher one during the build", async () => {
    const ledger = memoryLedger();
    const asc: FakeAppStoreConnect = { builds: [372] };
    const { deps, uploads } = harness(
      ledger.store,
      {
        exportSigned: async () => {
          asc.builds = [372, 374];
          await Promise.resolve();
        },
      },
      asc
    );
    await expect(runRelease(deps, requestOf())).rejects.toThrow(
      "App Store Connect now has build 374"
    );
    expect(uploads()).toStrictEqual([]);
    expect(ledger.states().at(-1)).toBe("373 abandoned");
  });

  it.each(["before-write", "after-write"] satisfies Fault[])(
    "never calls the uploader when upload_started fails to persist (%s)",
    async (fault) => {
      const ledger = memoryLedger();
      ledger.faults.set("upload_started", fault);
      const { deps, uploads } = harness(ledger.store);
      await expect(runRelease(deps, requestOf())).rejects.toThrow(
        /network down|after the write landed/u
      );
      expect(uploads()).toStrictEqual([]);
      expect(ledger.states()).not.toContain("373 abandoned");
    }
  );

  it("abandons without uploading when the IPA changes while App Store Connect is rechecked", async () => {
    const ledger = memoryLedger();
    const retained = { changed: false };
    let reads = 0;
    const { deps, uploads } = harness(ledger.store, {
      appStoreConnectBuilds: async () => {
        reads += 1;
        // The recheck's wait is where another process could swap the IPA.
        retained.changed = reads > 1;
        return await Promise.resolve([372]);
      },
      assertUnchanged: async () => {
        await (retained.changed
          ? Promise.reject(new Error("The IPA or release manifest changed"))
          : Promise.resolve());
      },
    });
    await expect(runRelease(deps, requestOf())).rejects.toThrow(
      "manifest changed"
    );
    expect(uploads()).toStrictEqual([]);
    expect(ledger.states().at(-1)).toBe("373 abandoned");
  });

  it("never calls the uploader when the IPA changes while upload_started is written", async () => {
    const ledger = memoryLedger();
    const retained = { changed: false };
    const store = {
      ...ledger.store,
      advance: async (parent: string, text: string, message: string) => {
        const head = await ledger.store.advance(parent, text, message);
        retained.changed = ledger.states().at(-1) === "373 upload_started";
        return head;
      },
    };
    const { deps, uploads } = harness(store, {
      assertUnchanged: async () => {
        await (retained.changed
          ? Promise.reject(new Error("The IPA or release manifest changed"))
          : Promise.resolve());
      },
    });
    await expect(runRelease(deps, requestOf())).rejects.toThrow(
      "Nothing was uploaded; the number stays burned as upload_started"
    );
    expect(uploads()).toStrictEqual([]);
    // The ledger never abandons upload_started, so the number is never reused.
    expect(ledger.states().at(-1)).toBe("373 upload_started");
    await expect(
      runRelease(harness(ledger.store).deps, requestOf("1002"))
    ).resolves.toMatchObject({ build: 374 });
  });

  it("refuses a rerun attempt before anything else", async () => {
    const { deps, calls } = harness(memoryLedger().store);
    await expect(runRelease(deps, requestOf("1001", 2))).rejects.toThrow(
      "attempt 2 of run 1001"
    );
    expect(calls).toStrictEqual([]);
  });

  it("refuses a run that already claimed, even as attempt 1", async () => {
    const ledger = memoryLedger();
    const first = harness(ledger.store, {
      upload: failingUpload("interrupted"),
    });
    await expect(runRelease(first.deps, requestOf("1001"))).rejects.toThrow(
      UploadOutcomeUnknownError
    );
    const again = harness(ledger.store);
    await expect(runRelease(again.deps, requestOf("1001"))).rejects.toThrow(
      "already claimed a build"
    );
    expect(again.uploads()).toStrictEqual([]);
  });
});

describe("after an upload starts", () => {
  it("keeps an upload that threw as upload_started, never retried or reused", async () => {
    const ledger = memoryLedger();
    const calls: string[] = [];
    const { deps } = harness(ledger.store, {
      upload: failingUpload("altool timed out after Apple accepted", calls),
    });
    await expect(runRelease(deps, requestOf())).rejects.toThrow(
      "never retried or reused"
    );
    expect(calls).toStrictEqual(["upload 373"]);
    expect(ledger.states().at(-1)).toBe("373 upload_started");
  });

  it("reports an accepted upload whose final record was lost as unknown, after exactly one upload", async () => {
    const ledger = memoryLedger();
    ledger.faults.set("upload_accepted", "before-write");
    const { deps, uploads } = harness(ledger.store);
    await expect(runRelease(deps, requestOf())).rejects.toThrow(
      "could not record it (network down). It stays upload_started"
    );
    expect(uploads()).toStrictEqual(["upload 373"]);
    expect(ledger.states().at(-1)).toBe("373 upload_started");
  });
});

const buildState = (overrides: Partial<BuildState> = {}): BuildState => ({
  buildId: "asc-build-1",
  version: "373",
  shortVersion: VERSION,
  processingState: "VALID",
  uploadedDate: AT,
  expired: false,
  internalBuildState: "IN_BETA_TESTING",
  externalBuildState: null,
  betaGroups: ["Internal"],
  ...overrides,
});

const uploaded = async (): Promise<MemoryLedger> => {
  const ledger = memoryLedger();
  await runRelease(harness(ledger.store).deps, requestOf());
  return ledger;
};

/** Polls a scripted App Store Connect with a fake clock: for three minutes, once a minute. */
const poll = (ledger: MemoryLedger, answers: (BuildState | null)[]) => {
  const reads: number[] = [];
  let now = Date.parse(AT);
  const result = awaitProcessing(
    {
      ledger: ledger.store,
      buildState: async (build) => {
        reads.push(build);
        return await Promise.resolve(answers.shift() ?? null);
      },
      sleep: async (ms) => {
        now += ms;
        await Promise.resolve();
      },
      now: () => new Date(now),
    },
    { ...requestOf(), timeoutMs: 180_000, intervalMs: 60_000 }
  );
  return { reads, result };
};

describe("processing", () => {
  it("records processed only for a VALID build with this exact version and number", async () => {
    const ledger = await uploaded();
    const { result } = poll(ledger, [
      null,
      buildState({ processingState: "PROCESSING" }),
      buildState(),
    ]);
    await expect(result).resolves.toMatchObject({ status: "processed" });
    expect(ledger.states().at(-1)).toBe("373 processed");
  });

  it.each([
    buildState({ shortVersion: "0.2.0" }),
    buildState({ version: "374" }),
    buildState({ expired: true }),
    null,
  ])(
    "stops at the bound and reports unknown, recording nothing (%j)",
    async (state) => {
      const ledger = await uploaded();
      const { reads, result } = poll(
        ledger,
        Array.from({ length: 9 }, () => state)
      );
      await expect(result).resolves.toMatchObject({ status: "unknown" });
      expect(reads).toHaveLength(4);
      expect(ledger.states().at(-1)).toBe("373 upload_accepted");
    }
  );

  it("reports Apple's processing failure without recording processed", async () => {
    const ledger = await uploaded();
    const { result } = poll(ledger, [
      buildState({ processingState: "INVALID" }),
    ]);
    await expect(result).resolves.toMatchObject({ status: "failed" });
    expect(ledger.states().at(-1)).toBe("373 upload_accepted");
  });

  it("refuses to check processing for a run without an accepted upload", async () => {
    await expect(poll(memoryLedger(), []).result).rejects.toThrow(
      "no accepted upload"
    );
  });
});

const unknownUpload = async (): Promise<MemoryLedger> => {
  const ledger = memoryLedger();
  const { deps } = harness(ledger.store, { upload: failingUpload("lost") });
  await expect(runRelease(deps, requestOf())).rejects.toThrow("lost");
  return ledger;
};

const reconcileWith = async (ledger: MemoryLedger, listed: readonly number[]) =>
  await reconcile(
    {
      ledger: ledger.store,
      appStoreConnectBuilds: async () => await Promise.resolve(listed),
      buildState: async () => await Promise.resolve(null),
    },
    BUNDLE
  );

describe("reconciliation", () => {
  it("reads only, and reports absence of an unknown upload as not proof", async () => {
    const ledger = await unknownUpload();
    const { head } = ledger.current();
    const entries = await reconcileWith(ledger, [371, 372]);
    expect(ledger.current().head).toBe(head);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      build: 373,
      ledgerState: "upload_started",
      appStoreConnect: "absent",
    });
    expect(entries[0]?.finding).toContain("Absence is not proof");
  });

  it("reports builds something other than this executor uploaded", async () => {
    const entries = await reconcileWith(await unknownUpload(), [372, 373, 376]);
    expect(
      entries.map((entry) => [entry.build, entry.ledgerState])
    ).toStrictEqual([
      [373, "upload_started"],
      [376, "absent"],
    ]);
    expect(entries[0]?.finding).toContain("never recorded");
  });
});

const KEY = { keyId: "KEY123", issuerId: "issuer", privateKey: "PEM" };
const IPA_BYTES = "signed ipa";
const MANIFEST_BYTES = "manifest";
const DISPATCH = {
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_RUN_ID: "1001",
  GITHUB_RUN_ATTEMPT: "2",
  GITHUB_SHA: SHA,
};

const uploader = (result: CommandResult) => {
  const out = mkdtempSync(path.join(tmpdir(), "pcob-upload-"));
  onTestFinished(() => {
    rmSync(out, { recursive: true, force: true });
  });
  mkdirSync(path.join(out, "export"));
  writeFileSync(path.join(out, "export/PCOBooster.ipa"), IPA_BYTES);
  writeFileSync(path.join(out, "release-manifest.json"), MANIFEST_BYTES);
  const identity = {
    ...identityFor(373),
    ipaSha256: sha256(IPA_BYTES),
    manifestSha256: sha256(MANIFEST_BYTES),
  };
  const calls: string[][] = [];
  const keyReads = { count: 0 };
  const upload = makeAltoolUploader({
    run: (command, args) => {
      const p8 = args[args.indexOf("--p8-file-path") + 1] ?? "";
      calls.push([
        command,
        ...args,
        existsSync(p8) ? "key-present" : "key-missing",
      ]);
      return result;
    },
    key: {
      ...KEY,
      get privateKey() {
        keyReads.count += 1;
        return KEY.privateKey;
      },
    },
    appId: "6753000000",
    out,
  });
  return { out, calls, upload, identity, keyReads };
};

describe("executor adapters", () => {
  it("reads a GitHub Actions dispatch on main", () => {
    expect(runIdentityFromEnv(DISPATCH)).toStrictEqual(runOf("1001", 2));
  });

  it.each([
    { GITHUB_EVENT_NAME: "push" },
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_ACTIONS: "1" },
    { GITHUB_SHA: "HEAD" },
  ])("refuses anything else (%j)", (change) => {
    expect(() => runIdentityFromEnv({ ...DISPATCH, ...change })).toThrow(
      "workflow_dispatch run on main"
    );
  });

  it("keeps the uploader's key in an owner-only file, removed afterwards", () => {
    const modes = withPrivateKeyFile(KEY, (file) => ({
      file,
      mode: statSync(file).mode % 0o1000,
      folder: statSync(path.dirname(file)).mode % 0o1000,
      contents: readFileSync(file, "utf-8"),
    }));
    expect(modes).toMatchObject({
      mode: 0o600,
      folder: 0o700,
      contents: "PEM",
    });
    expect(existsSync(path.dirname(modes.file))).toBeFalsy();
  });

  it("removes the uploader's key when the upload throws", () => {
    let seen = "";
    expect(() =>
      withPrivateKeyFile(KEY, (file) => {
        seen = file;
        throw new Error("uploader crashed");
      })
    ).toThrow("uploader crashed");
    expect(existsSync(path.dirname(seen))).toBeFalsy();
  });

  it("removes the uploader's key when the upload is interrupted", () => {
    const adapters = path.join(
      import.meta.dirname,
      "../apps/mobile/scripts/release/ci-adapters.ts"
    );
    const script = `
      import { spawnSync } from "node:child_process";
      import { withPrivateKeyFile } from ${JSON.stringify(adapters)};
      withPrivateKeyFile({ keyId: "K", issuerId: "I", privateKey: "PEM" }, (file) => {
        console.log(file);
        spawnSync("sh", ["-c", \`kill -INT \${process.pid}; sleep 1\`]);
      });
    `;
    const result = spawnSync("bun", ["-e", script], { encoding: "utf-8" });
    const file = result.stdout.trim();
    // Without a listener, the interrupt would end the process before any cleanup ran.
    expect(file).toMatch(/AuthKey_K\.p8$/u);
    expect(existsSync(path.dirname(file))).toBeFalsy();
  });

  it("makes one altool call of the verified IPA and returns its delivery id", async () => {
    const { calls, out, upload, identity } = uploader({
      status: 0,
      stdout:
        '{"success-message":"No errors uploading","delivery-uuid":"0a1b2c3d-0000-4000-8000-000000000001"}',
      stderr: "",
    });
    await expect(upload(identity)).resolves.toMatchObject({
      deliveryId: "0a1b2c3d-0000-4000-8000-000000000001",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(path.join(out, "export/PCOBooster.ipa"));
    expect(calls[0]?.at(-1)).toBe("key-present");
  });

  it("names the app and build to altool, which --upload-package requires", async () => {
    const { calls, upload, identity } = uploader({
      status: 0,
      stdout: "{}",
      stderr: "",
    });
    await upload(identity);
    const call = calls[0] ?? [];
    const flag = (name: string) => call[call.indexOf(name) + 1];
    expect(
      [
        "--apple-id",
        "--bundle-id",
        "--bundle-version",
        "--bundle-short-version-string",
      ].map(flag)
    ).toStrictEqual([
      "6753000000",
      identity.bundleId,
      String(identity.build),
      identity.version,
    ]);
  });

  it.each([
    ["IPA", "export/PCOBooster.ipa"],
    ["manifest", "release-manifest.json"],
  ])(
    "refuses a retained %s changed since verification, before the key or altool",
    async (_, file) => {
      const { calls, out, upload, identity, keyReads } = uploader({
        status: 0,
        stdout: "{}",
        stderr: "",
      });
      writeFileSync(path.join(out, file), "swapped");
      await expect(upload(identity)).rejects.toThrow(
        "changed since verification; nothing was uploaded"
      );
      expect(calls).toStrictEqual([]);
      expect(keyReads.count).toBe(0);
      expect(existsSync(path.join(out, "upload-output.txt"))).toBeFalsy();
    }
  );

  it("treats an error that exited zero as a failed upload", async () => {
    const zero = uploader({
      status: 0,
      stdout: '{"product-errors":[{"code":409}]}',
      stderr: "",
    });
    await expect(zero.upload(zero.identity)).rejects.toThrow("altool exited 0");
    expect(deliveryId("no id here")).toBeNull();
  });

  it("treats a failed exit as a failed upload and retains its output", async () => {
    const failed = uploader({ status: 1, stdout: "", stderr: "network" });
    await expect(failed.upload(failed.identity)).rejects.toThrow(
      "altool exited 1"
    );
    expect(
      readFileSync(path.join(failed.out, "upload-output.txt"), "utf-8")
    ).toContain("network");
  });

  it.each(["release", "availability"])(
    "the CLI refuses %s while blocked, whatever CI markers are set",
    (command) => {
      const result = spawnSync(
        "bun",
        ["run", "scripts/release/ci-cli.ts", command],
        {
          cwd: path.join(import.meta.dirname, "../apps/mobile"),
          encoding: "utf-8",
          env: {
            PATH: process.env.PATH ?? "",
            HOME: process.env.HOME ?? "",
            CI: "true",
            ...DISPATCH,
            GITHUB_RUN_ATTEMPT: "1",
            // Unreachable on purpose: a blocked command must not get this far.
            GITHUB_API_URL: "http://127.0.0.1:9",
          },
        }
      );
      expect(result.status).toBe(1);
      expect(result.stderr.trim()).toBe(BLOCKED_MESSAGE);
    }
  );
});
