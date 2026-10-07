/**
 * Shared fakes for the iOS release executor tests: a durable in-memory ledger that several
 * "runners" share, as they share the ledger branch, and executor dependencies that record calls.
 */
import { parseLedger } from "../../apps/mobile/scripts/release/ci-ledger";
import type {
  ArtifactIdentity,
  LedgerEvent,
  LedgerStore,
  RawLedger,
  RunIdentity,
} from "../../apps/mobile/scripts/release/ci-ledger";
import type {
  ReleaseDependencies,
  ReleaseRequest,
} from "../../apps/mobile/scripts/release/ci-release";
import { LedgerConflictError } from "../../apps/mobile/scripts/release/ledger-github";

export const BUNDLE = "com.pcobooster.ios";
export const VERSION = "0.1.0";
export const SHA = "a".repeat(40);
export const AT = "2026-10-07T00:00:00.000Z";
export const HEADER = JSON.stringify({
  version: 1,
  bundleId: BUNDLE,
  repository: "bodegalabs/pcobooster",
});

export const hex = (character: string): string => character.repeat(64);

export const runOf = (id = "1001", attempt = 1): RunIdentity => ({
  id,
  attempt,
  sha: SHA,
});

export const requestOf = (id = "1001", attempt = 1): ReleaseRequest => ({
  run: runOf(id, attempt),
  bundleId: BUNDLE,
  version: VERSION,
});

export const identityFor = (build: number): ArtifactIdentity => ({
  bundleId: BUNDLE,
  version: VERSION,
  build,
  sourceSha: SHA,
  archiveAppSha256: hex("1"),
  bundleSha256: hex("2"),
  ipaSha256: hex("3"),
  ipaFileName: "PCOBooster.ipa",
  dsymsSha256: hex("4"),
  dsyms: [
    {
      binary: "PCOBooster",
      uuid: "0A1B2C3D-0000-4000-8000-000000000001",
      archived: true,
      inIpaSymbols: true,
    },
  ],
  maps: {
    packagerSha256: hex("5"),
    composedSha256: hex("6"),
    provenanceSha256: hex("7"),
  },
  hermesEvidenceSha256: hex("8"),
  smokeEvidenceSha256: hex("9"),
  signing: { teamId: "6C46GY4Z38", authority: "Apple Distribution: Test" },
  manifestSha256: hex("b"),
});

export const claimOf = (build: number, id = "1001"): LedgerEvent => ({
  build,
  at: AT,
  run: runOf(id),
  state: "claimed",
  bundleId: BUNDLE,
  version: VERSION,
});

/** Fails the next write of a state without landing it, or lands it and then fails to answer. */
export type Fault = "before-write" | "after-write";

export interface MemoryLedger {
  readonly store: LedgerStore;
  readonly faults: Map<LedgerEvent["state"], Fault>;
  readonly current: () => RawLedger;
  /** Every event, as `"<build> <state>"`. */
  readonly states: () => string[];
}

export const memoryLedger = (eventsText = ""): MemoryLedger => {
  const heads: RawLedger[] = [
    { head: "commit-0", headerText: HEADER, eventsText },
  ];
  const faults = new Map<LedgerEvent["state"], Fault>();
  const current = (): RawLedger => {
    const head = heads.at(-1);
    if (head === undefined) {
      throw new Error("The fake ledger lost its head.");
    }
    return head;
  };
  const store: LedgerStore = {
    read: async () => await Promise.resolve(current()),
    advance: async (parent, text) => {
      await Promise.resolve();
      const written = parseLedger(
        { head: "next", headerText: HEADER, eventsText: text },
        BUNDLE
      ).events.at(-1);
      const fault =
        written === undefined ? undefined : faults.get(written.state);
      if (written !== undefined) {
        faults.delete(written.state);
      }
      if (fault === "before-write") {
        throw new Error("network down");
      }
      if (parent !== current().head) {
        throw new LedgerConflictError("moved");
      }
      const head = `commit-${heads.length}`;
      heads.push({ head, headerText: HEADER, eventsText: text });
      if (fault === "after-write") {
        throw new Error("connection reset after the write landed");
      }
      return head;
    },
  };
  const states = () =>
    parseLedger(current(), BUNDLE).events.map(
      (event) => `${event.build} ${event.state}`
    );
  return { store, faults, current, states };
};

/** App Store Connect's build numbers, changeable while a release runs. */
export interface FakeAppStoreConnect {
  builds: readonly number[];
}

export const harness = (
  store: LedgerStore,
  overrides: Partial<ReleaseDependencies> = {},
  asc: FakeAppStoreConnect | null = null
) => {
  const appStoreConnect = asc ?? { builds: [371, 372] };
  const calls: string[] = [];
  const deps: ReleaseDependencies = {
    ledger: store,
    appStoreConnectBuilds: async () => {
      calls.push("asc");
      return await Promise.resolve(appStoreConnect.builds);
    },
    preflight: async () => {
      calls.push("preflight");
      await Promise.resolve();
    },
    archive: async (build) => {
      calls.push(`archive ${build}`);
      await Promise.resolve();
    },
    exportSigned: async (build) => {
      calls.push(`export ${build}`);
      await Promise.resolve();
    },
    verifyExport: async (build) => {
      calls.push(`verify ${build}`);
      return await Promise.resolve(identityFor(build));
    },
    uploadSymbols: async () => {
      calls.push("symbols");
      return await Promise.resolve({
        clonedMapSha256: hex("c"),
        uploadedAt: AT,
      });
    },
    assertUnchanged: async () => {
      calls.push("unchanged");
      await Promise.resolve();
    },
    upload: async (identity) => {
      calls.push(`upload ${identity.build}`);
      return await Promise.resolve({
        deliveryId: null,
        outputSha256: hex("d"),
      });
    },
    now: () => new Date(AT),
    log: () => {
      // Warnings are asserted through ledger state instead.
    },
    ...overrides,
  };
  const uploads = () => calls.filter((call) => call.startsWith("upload"));
  return { deps, calls, uploads };
};

/** An uploader that fails as an interrupted or timed-out upload would. */
export const failingUpload =
  (reason: string, calls: string[] = []) =>
  async (identity: ArtifactIdentity) => {
    calls.push(`upload ${identity.build}`);
    await Promise.resolve();
    throw new Error(reason);
  };
