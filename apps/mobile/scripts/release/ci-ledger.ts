/**
 * The sole release executor's durable ledger: every build number it ever claimed, and how far
 * each release got. Unlike `release-state.ts` (one machine's preparation bookkeeping), this
 * outlives hosted runners, so a number is never handed out twice across runs.
 *
 * The ledger is an append-only list of events, one JSON line each. A build's events must follow
 *
 *   claimed -> verified -> upload_started -> upload_accepted -> processed
 *   claimed | verified -> abandoned
 *
 * all from the run that claimed it. A claimed number stays used forever, whatever happens to it.
 * An upload whose outcome is unknown stays `upload_started`: nothing may mark it abandoned or
 * retry it, because Apple may still have it. Unreadable or missing ledger state is an error,
 * never an empty ledger.
 *
 * Serialization comes from the workflow's app-wide concurrency group; the store's parent check
 * only proves each write landed on the state this run read. It is not a lock.
 */
import { isDeepStrictEqual } from "node:util";

import { Option, Schema } from "effect";

export const LEDGER_VERSION = 1;

const Sha256 = Schema.String.check(Schema.isPattern(/^[\da-f]{64}$/u));
const GitSha = Schema.String.check(Schema.isPattern(/^[\da-f]{40}$/u));
const BuildNumber = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0)
);
const Uuid = Schema.String.check(
  Schema.isPattern(/^[\dA-F]{8}-[\dA-F]{4}-[\dA-F]{4}-[\dA-F]{4}-[\dA-F]{12}$/u)
);

const HeaderSchema = Schema.Struct({
  version: Schema.Literal(LEDGER_VERSION),
  bundleId: Schema.String,
  repository: Schema.String,
});
export type LedgerHeader = typeof HeaderSchema.Type;

const RunSchema = Schema.Struct({
  /** `GITHUB_RUN_ID`. */
  id: Schema.String.check(Schema.isPattern(/^[1-9]\d*$/u)),
  /** `GITHUB_RUN_ATTEMPT`; only attempt 1 may claim or upload. */
  attempt: BuildNumber,
  /** The dispatched commit, `GITHUB_SHA`. */
  sha: GitSha,
});
export type RunIdentity = typeof RunSchema.Type;

const DsymSchema = Schema.Struct({
  /** Path of the executable inside the app, e.g. `PCOBooster` or `Frameworks/x.framework/x`. */
  binary: Schema.String,
  uuid: Uuid,
  /** Whether the archive's dSYMs hold this UUID (false only for an allow-listed framework). */
  archived: Schema.Boolean,
  /** Whether the IPA's `Symbols/` carries this UUID for Apple's symbolication. */
  inIpaSymbols: Schema.Boolean,
});

const ArtifactsSchema = Schema.Struct({
  bundleId: Schema.String,
  version: Schema.String,
  build: BuildNumber,
  sourceSha: GitSha,
  /** The unsigned archive app's tree hash (`release-archive-app` stamp). */
  archiveAppSha256: Sha256,
  /** `main.jsbundle`, the Hermes bytecode; identical in the archive and the signed IPA. */
  bundleSha256: Sha256,
  ipaSha256: Sha256,
  ipaFileName: Schema.String,
  dsymsSha256: Sha256,
  dsyms: Schema.Array(DsymSchema),
  maps: Schema.Struct({
    packagerSha256: Sha256,
    composedSha256: Sha256,
    provenanceSha256: Sha256,
  }),
  hermesEvidenceSha256: Sha256,
  smokeEvidenceSha256: Sha256,
  signing: Schema.Struct({
    teamId: Schema.String,
    authority: Schema.String,
  }),
  /** The retained `release-manifest.json` describing all of the above. */
  manifestSha256: Sha256,
});
export type ArtifactIdentity = typeof ArtifactsSchema.Type;

const SymbolsSchema = Schema.Struct({
  /** The composed map after `hermes clone`, as `source-maps.ts verify --cloned` checked it. */
  clonedMapSha256: Sha256,
  uploadedAt: Schema.String,
});
export type SymbolUpload = typeof SymbolsSchema.Type;

const ReceiptSchema = Schema.Struct({
  /** Apple's delivery UUID when the uploader printed one. */
  deliveryId: Schema.NullOr(Schema.String),
  /** The uploader's full output, hashed so the retained log can be matched to this record. */
  outputSha256: Sha256,
});
export type UploadReceipt = typeof ReceiptSchema.Type;

const base = {
  build: BuildNumber,
  at: Schema.String,
  run: RunSchema,
};

const EventSchema = Schema.Union([
  Schema.Struct({
    ...base,
    state: Schema.Literal("claimed"),
    bundleId: Schema.String,
    version: Schema.String,
  }),
  Schema.Struct({
    ...base,
    state: Schema.Literal("verified"),
    artifacts: ArtifactsSchema,
    symbols: SymbolsSchema,
  }),
  Schema.Struct({
    ...base,
    state: Schema.Literal("upload_started"),
    ipaSha256: Sha256,
  }),
  Schema.Struct({
    ...base,
    state: Schema.Literal("upload_accepted"),
    receipt: ReceiptSchema,
  }),
  Schema.Struct({
    ...base,
    state: Schema.Literal("processed"),
    ascBuildId: Schema.String,
    processingState: Schema.Literal("VALID"),
  }),
  Schema.Struct({
    ...base,
    state: Schema.Literal("abandoned"),
    reason: Schema.String,
  }),
]);
export type LedgerEvent = typeof EventSchema.Type;
export type LedgerState = LedgerEvent["state"];

const decodeHeader = Schema.decodeUnknownOption(
  Schema.fromJsonString(HeaderSchema)
);
const decodeEvent = Schema.decodeUnknownOption(
  Schema.fromJsonString(EventSchema)
);

/** The ledger exactly as the store holds it at one head. */
export interface RawLedger {
  /** The store's version of this state (a commit SHA for the GitHub store). */
  readonly head: string;
  readonly headerText: string;
  readonly eventsText: string;
}

export interface Ledger extends RawLedger {
  readonly header: LedgerHeader;
  readonly events: readonly LedgerEvent[];
  /** Each claimed build's events, in order. */
  readonly records: ReadonlyMap<number, readonly LedgerEvent[]>;
}

/**
 * Durable storage that only moves forward. `advance` must fail, not overwrite, when the head is
 * no longer `parent`, and must never fall back to an expiring cache.
 */
export interface LedgerStore {
  readonly read: () => Promise<RawLedger>;
  /** Writes `eventsText` as a child of `parent` and returns the new head. */
  readonly advance: (
    parent: string,
    eventsText: string,
    message: string
  ) => Promise<string>;
}

const NEXT: Readonly<Record<LedgerState, readonly LedgerState[]>> = {
  claimed: ["verified", "abandoned"],
  verified: ["upload_started", "abandoned"],
  upload_started: ["upload_accepted"],
  upload_accepted: ["processed"],
  processed: [],
  abandoned: [],
};

/** Why `event` cannot follow `history` (the build's events so far), or null when it can. */
const transitionProblem = (
  history: readonly LedgerEvent[],
  event: LedgerEvent,
  highest: number
): string | null => {
  const last = history.at(-1);
  if (last === undefined) {
    if (event.state !== "claimed") {
      return `build ${event.build} was never claimed, so it cannot be ${event.state}`;
    }
    if (event.build <= highest) {
      return `claim of build ${event.build} is not above ledger build ${highest}`;
    }
    return null;
  }
  if (!NEXT[last.state].includes(event.state)) {
    return `build ${event.build} is ${last.state} and cannot become ${event.state}`;
  }
  const [claim] = history;
  if (
    claim !== undefined &&
    (claim.run.id !== event.run.id || claim.run.attempt !== event.run.attempt)
  ) {
    return `build ${event.build} belongs to run ${claim.run.id} attempt ${claim.run.attempt}, not run ${event.run.id} attempt ${event.run.attempt}`;
  }
  if (event.state === "upload_started") {
    const verified = history.find((item) => item.state === "verified");
    if (
      verified?.state !== "verified" ||
      verified.artifacts.ipaSha256 !== event.ipaSha256
    ) {
      return `build ${event.build} would upload an IPA other than the one it verified`;
    }
  }
  return null;
};

const fold = (
  events: readonly LedgerEvent[]
): Map<number, readonly LedgerEvent[]> => {
  const records = new Map<number, LedgerEvent[]>();
  const claimingRuns = new Set<string>();
  let highest = 0;
  for (const event of events) {
    const history = records.get(event.build) ?? [];
    const runId = event.run.id;
    const problem =
      event.state === "claimed" && claimingRuns.has(runId)
        ? `run ${runId} already claimed a build`
        : transitionProblem(history, event, highest);
    if (event.state === "claimed") {
      claimingRuns.add(runId);
    }
    if (problem !== null) {
      throw new Error(`The release ledger is inconsistent: ${problem}.`);
    }
    records.set(event.build, [...history, event]);
    highest = Math.max(highest, event.build);
  }
  return records;
};

/** Decodes and checks a ledger; anything unreadable fails, so a broken ledger never reads as empty. */
export const parseLedger = (raw: RawLedger, bundleId: string): Ledger => {
  const header = decodeHeader(raw.headerText);
  if (Option.isNone(header)) {
    throw new Error(
      "The release ledger header is missing or unreadable; refusing to treat it as empty."
    );
  }
  if (header.value.bundleId !== bundleId) {
    throw new Error(
      `The release ledger belongs to ${header.value.bundleId}, not ${bundleId}.`
    );
  }
  if (raw.eventsText !== "" && !raw.eventsText.endsWith("\n")) {
    throw new Error(
      "The release ledger ends in a partial line; refusing to read it."
    );
  }
  const events = raw.eventsText
    .split("\n")
    .filter((line) => line !== "")
    .map((line, index) => {
      const event = decodeEvent(line);
      if (Option.isNone(event)) {
        throw new Error(`Release ledger line ${index + 1} is unreadable.`);
      }
      return event.value;
    });
  return { ...raw, header: header.value, events, records: fold(events) };
};

export const readLedger = async (
  store: LedgerStore,
  bundleId: string
): Promise<Ledger> => parseLedger(await store.read(), bundleId);

/** Every build number the ledger has claimed, whatever became of it. */
export const ledgerBuilds = (ledger: Ledger): number[] => [
  ...ledger.records.keys(),
];

/** The build this run claimed, if any. */
export const runRecord = (
  ledger: Ledger,
  runId: string
): readonly LedgerEvent[] | null =>
  [...ledger.records.values()].find(
    (history) => history[0]?.run.id === runId
  ) ?? null;

export const lastState = (history: readonly LedgerEvent[]): LedgerState => {
  const last = history.at(-1);
  if (last === undefined) {
    throw new Error("A ledger record has no events.");
  }
  return last.state;
};

export const encodeEvent = (event: LedgerEvent): string =>
  `${JSON.stringify(event)}\n`;

/**
 * Appends `event` to `ledger` in `store`, then reads the store again and requires the new head to
 * hold exactly the old events plus this one. Any failure is thrown: the caller must not continue
 * as if the event were durable, and must not retry it.
 */
export const persistEvent = async (
  store: LedgerStore,
  ledger: Ledger,
  event: LedgerEvent
): Promise<Ledger> => {
  // Checks the transition before writing anything.
  fold([...ledger.events, event]);
  const eventsText = `${ledger.eventsText}${encodeEvent(event)}`;
  const head = await store.advance(
    ledger.head,
    eventsText,
    `ios-release: build ${event.build} ${event.state} (run ${event.run.id}/${event.run.attempt})`
  );
  // The reread must follow the write: it is what proves the write is durable.
  // oxlint-disable-next-line react-doctor/server-sequential-independent-await
  const reread = await readLedger(store, ledger.header.bundleId);
  if (
    reread.head !== head ||
    reread.eventsText !== eventsText ||
    !isDeepStrictEqual(reread.events.at(-1), event)
  ) {
    throw new Error(
      `The release ledger did not durably record build ${event.build} ${event.state}; stopping without continuing.`
    );
  }
  return reread;
};
