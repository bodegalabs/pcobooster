import type { BuildState } from "./asc";
import {
  lastState,
  ledgerBuilds,
  persistEvent,
  readLedger,
  runRecord,
} from "./ci-ledger";
import type {
  ArtifactIdentity,
  Ledger,
  LedgerEvent,
  LedgerStore,
  RunIdentity,
  SymbolUpload,
  UploadReceipt,
} from "./ci-ledger";
/**
 * The sole release executor's program: one dispatched run claims one build number, prepares and
 * verifies exactly one signed IPA, and makes at most one upload attempt. Every external step is
 * injected so its ordering and crash behavior are tested without Apple, GitHub, or Xcode.
 *
 * Order, and what a failure at each point leaves behind:
 *   1. Refuse any rerun attempt, then check source and smoke evidence. Nothing is claimed.
 *   2. Read the durable ledger and App Store Connect; allocate above every ASC build, in-flight
 *      upload, and ledger claim. Unreadable state fails here.
 *   3. Persist `claimed` before any archive work. If that write fails, stop: the number may or
 *      may not be burned, and the next run rereads the ledger.
 *   4. Archive, export, verify the signed IPA, upload symbols, persist `verified`. A failure
 *      marks the claim `abandoned`; the number stays burned.
 *   5. Recheck App Store Connect and then the IPA, then persist `upload_started`. If that write fails,
 *      the uploader is never called. Recheck the IPA once more after the write lands, since the
 *      App Store Connect read and the ledger write both wait; a change leaves `upload_started`
 *      (the ledger never abandons it) and the uploader is never called.
 *   6. Call the uploader once. A throw leaves `upload_started`: the outcome is unknown, so
 *      nothing retries it and the number is never reused.
 *   7. Persist `upload_accepted`. If that write fails, the upload happened but the ledger says
 *      `upload_started`; reconciliation reports it.
 */
import {
  chooseBuildNumber,
  processingOutcome,
  stillUnused,
} from "./release-rules";

export type Enablement = "blocked" | "approved";

/**
 * Whether the executor may write the ledger, sign, or upload. Change it only in the reviewed
 * commit that follows approved, proven provisioning (docs/ci-cd.md); no environment variable or
 * flag overrides it.
 */
export const RELEASE_ENABLEMENT: Enablement = "blocked";

export const BLOCKED_MESSAGE =
  "BLOCKED: the iOS release executor is not enabled. Approve and prove the isolated credentials, protected environment, ledger branch, signing export, and artifact and symbol gates in docs/ci-cd.md, then enable it in a reviewed change.";

/** Fails before any credential, ledger, or Apple access while the executor is blocked. */
export const assertReleaseEnabled = (
  enablement: Enablement = RELEASE_ENABLEMENT
): void => {
  if (enablement !== "approved") {
    throw new Error(BLOCKED_MESSAGE);
  }
};

/** An upload may have reached Apple. Never retry it; reconcile instead. */
export class UploadOutcomeUnknownError extends Error {
  override name = "UploadOutcomeUnknownError";
}

export interface ReleaseRequest {
  readonly run: RunIdentity;
  readonly bundleId: string;
  readonly version: string;
}

export interface ReleaseDependencies {
  readonly ledger: LedgerStore;
  /** Every build number App Store Connect has, builds and in-flight uploads; throws when unsure. */
  readonly appStoreConnectBuilds: () => Promise<readonly number[]>;
  /** Exact-source and Release simulator smoke gates. Runs before anything is claimed. */
  readonly preflight: () => Promise<void>;
  readonly archive: (build: number) => Promise<void>;
  readonly exportSigned: (build: number) => Promise<void>;
  readonly verifyExport: (build: number) => Promise<ArtifactIdentity>;
  /** Uploads the verified source maps and proves the cloned map still matches. */
  readonly uploadSymbols: (identity: ArtifactIdentity) => Promise<SymbolUpload>;
  /** Throws when the retained IPA or manifest changed since verification. */
  readonly assertUnchanged: (identity: ArtifactIdentity) => Promise<void>;
  /** One delivery attempt of the verified IPA; resolves only when the uploader reports success. */
  readonly upload: (identity: ArtifactIdentity) => Promise<UploadReceipt>;
  readonly now: () => Date;
  readonly log: (line: string) => void;
}

export interface ReleaseResult {
  readonly build: number;
  readonly identity: ArtifactIdentity;
  readonly receipt: UploadReceipt;
}

const assertFirstAttempt = (run: RunIdentity): void => {
  if (run.attempt !== 1) {
    throw new Error(
      `This is attempt ${run.attempt} of run ${run.id}. A rerun never claims a number or uploads, because an earlier attempt may have; dispatch a new run after reconciling.`
    );
  }
};

const assertMatches = (
  identity: ArtifactIdentity,
  build: number,
  request: ReleaseRequest
): void => {
  if (
    identity.build !== build ||
    identity.bundleId !== request.bundleId ||
    identity.version !== request.version ||
    identity.sourceSha !== request.run.sha
  ) {
    throw new Error(
      "The verified artifacts describe a different app, version, build, or revision."
    );
  }
};

export const runRelease = async (
  deps: ReleaseDependencies,
  request: ReleaseRequest
): Promise<ReleaseResult> => {
  const { run } = request;
  assertFirstAttempt(run);
  await deps.preflight();
  let ledger = await readLedger(deps.ledger, request.bundleId);
  if (runRecord(ledger, run.id) !== null) {
    throw new Error(
      `Run ${run.id} already claimed a build; it never claims twice.`
    );
  }
  for (const [build, history] of ledger.records) {
    if (lastState(history) === "upload_started") {
      deps.log(
        `warning: build ${build} has an unknown upload outcome; it stays burned. Run reconcile.`
      );
    }
  }
  const build = chooseBuildNumber(
    {
      appStoreConnect: await deps.appStoreConnectBuilds(),
      claimed: ledgerBuilds(ledger),
    },
    null
  );
  const stamp = { build, run, at: deps.now().toISOString() } as const;
  const record = async (event: LedgerEvent): Promise<Ledger> => {
    ledger = await persistEvent(deps.ledger, ledger, event);
    deps.log(`ledger: build ${build} ${event.state}`);
    return ledger;
  };
  await record({
    ...stamp,
    state: "claimed",
    bundleId: request.bundleId,
    version: request.version,
  });

  let identity: ArtifactIdentity;
  try {
    await deps.archive(build);
    await deps.exportSigned(build);
    identity = await deps.verifyExport(build);
    assertMatches(identity, build, request);
    const symbols = await deps.uploadSymbols(identity);
    await record({
      ...stamp,
      at: deps.now().toISOString(),
      state: "verified",
      artifacts: identity,
      symbols,
    });
    stillUnused(build, await deps.appStoreConnectBuilds());
    await deps.assertUnchanged(identity);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const state = lastState(ledger.records.get(build) ?? []);
    if (state === "claimed" || state === "verified") {
      try {
        await record({
          ...stamp,
          at: deps.now().toISOString(),
          state: "abandoned",
          reason,
        });
      } catch (abandonError) {
        const why =
          abandonError instanceof Error
            ? abandonError.message
            : String(abandonError);
        deps.log(
          `warning: could not mark build ${build} abandoned (${why}); it stays burned either way.`
        );
      }
    }
    throw error;
  }

  await record({
    ...stamp,
    at: deps.now().toISOString(),
    state: "upload_started",
    ipaSha256: identity.ipaSha256,
  });
  try {
    await deps.assertUnchanged(identity);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Build ${build} changed after upload_started was recorded (${why}). Nothing was uploaded; the number stays burned as upload_started and is never retried. Run reconcile.`,
      { cause: error }
    );
  }
  let receipt: UploadReceipt;
  try {
    receipt = await deps.upload(identity);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    throw new UploadOutcomeUnknownError(
      `The upload of build ${build} failed or was interrupted (${why}). Apple may still have it: the ledger keeps it upload_started, and it is never retried or reused. Run reconcile.`
    );
  }
  try {
    await record({
      ...stamp,
      at: deps.now().toISOString(),
      state: "upload_accepted",
      receipt,
    });
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    throw new UploadOutcomeUnknownError(
      `The uploader accepted build ${build}, but the ledger could not record it (${why}). It stays upload_started; run reconcile, and never retry it.`
    );
  }
  return { build, identity, receipt };
};

export type ProcessingStatus = "processed" | "failed" | "unknown";

export interface AvailabilityReport {
  readonly build: number;
  readonly status: ProcessingStatus;
  readonly checkedAt: string;
  readonly state: BuildState | null;
  readonly limits: string;
}

export interface AvailabilityDependencies {
  readonly ledger: LedgerStore;
  readonly buildState: (build: number) => Promise<BuildState | null>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
}

const AVAILABILITY_LIMITS =
  "App Store Connect processing only. Tester-group access, release metadata, and physical-device acceptance are checked separately by a person.";

/**
 * Reads App Store Connect, at most until `timeoutMs`, for the build this run uploaded. Records
 * `processed` only for a VALID build with this exact version and build number. Running out of
 * time, or Apple not listing the build yet, is `unknown`: never proof that a retry is safe.
 */
export const awaitProcessing = async (
  deps: AvailabilityDependencies,
  request: ReleaseRequest & {
    readonly timeoutMs: number;
    readonly intervalMs: number;
  }
): Promise<AvailabilityReport> => {
  const ledger = await readLedger(deps.ledger, request.bundleId);
  const history = runRecord(ledger, request.run.id);
  const claim = history?.[0];
  if (
    history === null ||
    claim === undefined ||
    lastState(history) !== "upload_accepted"
  ) {
    throw new Error(`Run ${request.run.id} has no accepted upload to check.`);
  }
  const { build } = claim;
  const deadline = deps.now().getTime() + request.timeoutMs;
  const report = (
    status: ProcessingStatus,
    state: BuildState | null
  ): AvailabilityReport => ({
    build,
    status,
    checkedAt: deps.now().toISOString(),
    state,
    limits: AVAILABILITY_LIMITS,
  });
  for (;;) {
    // Each read decides whether to wait for the next.
    // oxlint-disable-next-line no-await-in-loop
    const state = await deps.buildState(build);
    const outcome = processingOutcome(state, build, request.version);
    if (state !== null && outcome === "processed") {
      // oxlint-disable-next-line no-await-in-loop
      await persistEvent(deps.ledger, ledger, {
        build,
        run: request.run,
        at: deps.now().toISOString(),
        state: "processed",
        ascBuildId: state.buildId,
        processingState: "VALID",
      });
      return report("processed", state);
    }
    if (outcome === "failed") {
      return report("failed", state);
    }
    if (deps.now().getTime() + request.intervalMs > deadline) {
      return report("unknown", state);
    }
    // oxlint-disable-next-line no-await-in-loop
    await deps.sleep(request.intervalMs);
  }
};

export interface ReconcileDependencies {
  readonly ledger: LedgerStore;
  readonly appStoreConnectBuilds: () => Promise<readonly number[]>;
  readonly buildState: (build: number) => Promise<BuildState | null>;
}

export interface ReconcileEntry {
  readonly build: number;
  readonly run: string;
  readonly ledgerState: LedgerEvent["state"] | "absent";
  readonly appStoreConnect: "listed" | "absent";
  readonly processingState: string | null;
  readonly finding: string;
}

const NEVER_UPLOADED = {
  listed:
    "Unexpected: App Store Connect has a number this executor never uploaded. Investigate before releasing.",
  absent: "Never uploaded. The number stays burned.",
};

/** What each ledger state means, depending on whether App Store Connect lists the build. */
const FINDINGS: Readonly<
  Record<
    ReconcileEntry["ledgerState"],
    { readonly listed: string; readonly absent: string }
  >
> = {
  claimed: NEVER_UPLOADED,
  verified: NEVER_UPLOADED,
  abandoned: NEVER_UPLOADED,
  upload_started: {
    listed:
      "App Store Connect has this build, though the uploader's outcome was never recorded.",
    absent:
      "Unknown: the upload may have reached Apple. Absence is not proof; the number stays burned and is never retried.",
  },
  upload_accepted: {
    listed: "Accepted; App Store Connect lists it. Check processing.",
    absent: "Accepted by the uploader; App Store Connect does not list it yet.",
  },
  processed: {
    listed:
      "Processed. Tester access and device acceptance are separate checks.",
    absent:
      "Processed earlier, but App Store Connect no longer lists it. Investigate.",
  },
  absent: {
    listed:
      "App Store Connect has a build this executor never claimed: something else uploaded it. Allocation stays above it.",
    absent: "",
  },
};

const finding = (
  state: ReconcileEntry["ledgerState"],
  listed: boolean
): string => FINDINGS[state][listed ? "listed" : "absent"];

/** Compares the ledger with App Store Connect. Reads only; never writes either. */
export const reconcile = async (
  deps: ReconcileDependencies,
  bundleId: string
): Promise<ReconcileEntry[]> => {
  const ledger = await readLedger(deps.ledger, bundleId);
  const listed = new Set(await deps.appStoreConnectBuilds());
  // Builds below the first claim predate the ledger; anything after it should be the ledger's.
  const first = Math.min(...ledgerBuilds(ledger));
  const entries = await Promise.all(
    [...ledger.records].map(async ([build, history]) => {
      const state = lastState(history);
      const details =
        state === "processed" ? null : await deps.buildState(build);
      return {
        build,
        run: history[0]?.run.id ?? "",
        ledgerState: state,
        appStoreConnect: listed.has(build) ? "listed" : "absent",
        processingState: details?.processingState ?? null,
        finding: finding(state, listed.has(build)),
      } satisfies ReconcileEntry;
    })
  );
  const foreign = [...listed]
    .filter((build) => build > first && !ledger.records.has(build))
    .toSorted((a, b) => a - b)
    .map((build): ReconcileEntry => ({
      build,
      run: "",
      ledgerState: "absent",
      appStoreConnect: "listed",
      processingState: null,
      finding: finding("absent", true),
    }));
  return [...entries, ...foreign].toSorted((a, b) => a.build - b.build);
};
