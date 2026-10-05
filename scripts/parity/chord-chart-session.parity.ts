import {
  CHORD_CHART_DRAFT_LIFETIME_MS,
  isSameDraft,
  parseStoredChordChartSession,
} from "@/lib/chord-chart-draft";
import type {
  ChordChartDraft,
  StoredChordChartSession,
} from "@/lib/chord-chart-draft";
import {
  SAVE_AS_YOU_TYPE_PAUSE_MS,
  adoptTheirChordChart,
  beginChordChartSave,
  canSaveChordChart,
  changedLayout,
  chordChartCopy,
  chordChartSaveFailed,
  chordChartSaveRequest,
  chordChartSaveStatus,
  chordChartSaveSucceeded,
  discardUnsavedChordChart,
  editChordChartDraft,
  importIntoChordChart,
  isDirty,
  isNewerVersion,
  keepMyChordChart,
  receiveChordChartVersion,
  receiveConflictVersion,
  revertChordChart,
  savesAsYouType,
  startChordChartSession,
  storedChordChartSession,
  transposeChordChartDraft,
  versionOf,
} from "@/lib/chord-chart-session";
import type {
  ChordChartImportText,
  ChordChartSession,
  ChordChartVersion,
  SaveAsYouTypeOptions,
} from "@/lib/chord-chart-session";

/**
 * Parity suites for the iOS port of the chord chart editing session
 * (`apps/web/src/lib/chord-chart-session.ts`), its drafts and stored sessions
 * (`apps/web/src/lib/chord-chart-draft.ts`), and the flags the editor reads from a session
 * (`apps/web/src/hooks/use-chord-chart-workspace.ts`). Swift replays them in
 * `apps/ios/PCOBoosterCore/Tests/PCOBoosterCoreTests/Logic/ChordChartSession/`.
 *
 * The session is a state machine, so the main suite encodes sequences of transitions
 * (receive a version, edit, save, fail, resolve a conflict, reload from storage) and records
 * everything observable after each step: the session itself, its save status and request,
 * what Save as you type would do under every option, and what storage would keep. Every test
 * in `chord-chart-session.test.ts` is a seed sequence; a seeded generator adds random ones.
 */
import type {
  ChordChartArrangement,
  ChordChartLayout,
} from "../../packages/contracts/src/chord-charts";
import { defineParitySuite } from "./parity";
import type { ParitySuite } from "./parity";

const char = (codePoint: number) => String.fromCodePoint(codePoint);
const NBSP = char(0xa0);
const NEXT_LINE = char(0x85);
const BOM = char(0xfe_ff);
const LINE_SEPARATOR = char(0x20_28);
const IDEOGRAPHIC_SPACE = char(0x30_00);
const COMBINING_ACUTE = char(0x3_01);

/** Park and Miller's minimal standard generator, so fixtures stay reproducible. */
const createRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
};

const pick = <T>(random: () => number, items: readonly T[]): T => {
  const item = items.at(Math.floor(random() * items.length));
  if (item === undefined) {
    throw new Error("Cannot pick from an empty list");
  }
  return item;
};

// Values from chord-chart-session.test.ts

const LAYOUT: ChordChartLayout = {
  font: "Times-Roman",
  fontSize: 12,
  columns: 2,
  chordColor: 1,
  pageSize: "Letter",
  orientation: "Portrait",
  margin: "0.5in",
};

const NOW = Date.UTC(2026, 9, 1, 12);
const V1 = "2026-09-01T12:00:00Z";
const V2 = "2026-09-02T12:00:00Z";
const V3 = "2026-09-03T12:00:00Z";

const draft = (
  chart: string,
  key: string | null = "G",
  layout: ChordChartLayout = LAYOUT
): ChordChartDraft => ({ chart, key, layout });

const version = (
  chart: string,
  updatedAt: string | null
): ChordChartVersion => ({ draft: draft(chart), updatedAt });

// Corpora

const UNSET_LAYOUT: ChordChartLayout = {
  font: null,
  fontSize: null,
  columns: null,
  chordColor: null,
  pageSize: null,
  orientation: null,
  margin: null,
};

const WIDE_LAYOUT: ChordChartLayout = {
  font: "Helvetica",
  fontSize: 48,
  columns: 1,
  chordColor: 0,
  pageSize: "Widescreen (16x9)",
  orientation: "Landscape",
  margin: "0.0in",
};

/** Layouts whose fields stay in the schema's order, as every layout from the API does. */
const LAYOUTS: readonly ChordChartLayout[] = [
  LAYOUT,
  { ...LAYOUT, font: null },
  { ...LAYOUT, fontSize: 16 },
  { ...LAYOUT, columns: 1 },
  { ...LAYOUT, chordColor: 5 },
  { ...LAYOUT, pageSize: "A4" },
  { ...LAYOUT, orientation: "Landscape" },
  { ...LAYOUT, margin: "1.0in" },
  { ...LAYOUT, fontSize: 16, font: null },
  { ...LAYOUT, font: "Noto Sans" },
  UNSET_LAYOUT,
  WIDE_LAYOUT,
];

const CHARTS: readonly string[] = [
  "VERSE",
  "VERSE\n[G]Amazing",
  "VERSE\n[G]Amazing  ",
  "VERSE mine",
  "",
  "  \n",
  "A\n\n",
  "CHORUS\n[C]Grace [D]flows",
  "[G]Grace",
  "VERSE 1\nG       D\nAmazing grace how sweet",
  "Ñandú [Em]canción",
  `e${COMBINING_ACUTE}`,
  "é",
  "[G]🎸 praise\tline",
  "VERSE\r\n[G]A",
];

const KEYS: readonly (string | null)[] = [
  "G",
  "A",
  "Gb",
  "C#m",
  null,
  "H",
  "Bb",
  "Em",
  "",
  " G ",
];

const DRAFTS: readonly ChordChartDraft[] = [
  draft("VERSE"),
  draft("VERSE", "A"),
  draft("VERSE", null),
  draft("VERSE", "G", { ...LAYOUT, columns: 1 }),
  draft("VERSE", "G", { ...LAYOUT, font: null }),
  draft("VERSE\n[G]Amazing"),
  draft("VERSE\n[G]Amazing  "),
  draft(""),
  draft(`e${COMBINING_ACUTE}`),
  draft("é"),
  draft("é", "Gb"),
  draft("[G]Grace", "G", UNSET_LAYOUT),
  draft("A\n\n", "Em", WIDE_LAYOUT),
  draft("CHORUS", ""),
];

/** Planning Center versions: timestamps as times, and text that is not one. */
const TIMESTAMPS: readonly (string | null)[] = [
  null,
  V1,
  V2,
  V3,
  "2026-09-02T12:00:00.000Z",
  "2026-09-02T12:00:00.001Z",
  "2026-09-02T11:59:59.999Z",
  "2026-09-02T14:00:00+02:00",
  "2026-09-02T14:00:00+0200",
  "2026-09-02T04:00:00-08:00",
  "2026-09-02T12:00:00.5+01:00",
  "2026-09-02t12:00:00z",
  "2026-09-02 12:00:00Z",
  "2026-09-02T12:00:00",
  "2026-09-02",
  "2026-09",
  "2026",
  "2026-09-02T12:00Z",
  "2026-09-02T12:00+01:00",
  "2026-09-02T12:00:00.1Z",
  "2026-09-02T12:00:00.12Z",
  "2026-09-02T12:00:00.123456Z",
  "2026-09-01T24:00:00Z",
  "2026-02-30T00:00:00Z",
  "2026-03-02T00:00:00Z",
  "2026-09-31T00:00:00Z",
  "2026-09-02T12:00:00-23:59",
  "+002026-09-02T12:00:00Z",
  "+002026-09",
  "-000001-01-01T00:00:00Z",
  "0000-01-01T00:00:00Z",
  "0099-12-31T23:59:59.999Z",
  "+275760-09-13T00:00:00Z",
  "-271821-04-20T00:00:00Z",
  "2026-09-02T12Z",
  "2026-13-01T00:00:00Z",
  "2026-00-01T00:00:00Z",
  "2026-09-00T00:00:00Z",
  "2026-09-32T00:00:00Z",
  "2026-09-02T25:00:00Z",
  "2026-09-02T12:60:00Z",
  "2026-09-02T12:00:60Z",
  "2026-09-02T24:00:01Z",
  "2026-09-02T24:00:00.001Z",
  "-000000-01-01T00:00:00Z",
  "275760-09-13T00:00:00Z",
  "+275760-09-13T00:00:00.001Z",
  "-271821-04-19T23:59:59.999Z",
  " 2026-09-02T12:00:00Z",
  "2026-09-02T12:00:00Z ",
  "2026-09-02T12:00:00 Z",
  "2026-09-02T12:00:00.Z",
  "2026-09-02T12:00:.5Z",
  "2026-09-02T1:00:00Z",
  "2026-09-02T12+01:00",
  "2026-09-02T12:00:00+05",
  "2026-09-02T12:00:00+24:00",
  "2026-09-02T12:00:00+05:60",
  "2026-09-02T12:00:00Zjunk",
  "2026-09-02T12:00:00GMT",
  "20260902T120000Z",
  "2026-09-02T",
  "",
  "V1",
  "not a date",
  "1e3",
];

const parsedTime = (text: string): number | null => {
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : time;
};

/** Text Planning Center might send that `Date.parse` reads as a time, and text it doesn't. */
const VERSION_TIMES: readonly (string | null)[] = [
  V1,
  V2,
  V3,
  "2026-09-04T12:00:00Z",
  null,
  "2026-09-02T12:00:00.000Z",
  "2026-09-02T14:00:00+02:00",
  "2026-08-31T12:00:00Z",
  "garbled",
];

const IMPORT_CHARTS: readonly string[] = [
  "OLD",
  "A\n\n",
  "  \n",
  "",
  `A \t${NBSP}`,
  `A${NEXT_LINE}`,
  `A${BOM}`,
  `A${LINE_SEPARATOR}`,
  `x${IDEOGRAPHIC_SPACE}`,
  "VERSE\r\n",
];

const IMPORT_TEXTS: readonly ChordChartImportText[] = [
  { chart: "NEW", key: null },
  { chart: "NEW", key: "Gb" },
  { chart: "B", key: "D" },
  { chart: "", key: null },
  { chart: "\n[G]Amazing\n", key: "G" },
  { chart: "B", key: "" },
];

const IMPORT_MODES = ["replace", "append"] as const;

const TRANSPOSE_CHARTS: readonly string[] = [
  "[G]Grace",
  "VERSE 1\nG       D\nAmazing grace how sweet",
  "[Em]Oh [C]come",
  "",
  "N.C.\n[G/B]x",
];
const TRANSPOSE_KEYS: readonly (string | null)[] = [
  "G",
  "Em",
  "Gb",
  null,
  "H",
  "C#m",
  "Bbm",
];
const TRANSPOSE_TARGETS: readonly string[] = [
  "A",
  "Gb",
  "F#m",
  "Bb",
  "C",
  "H",
  "",
  "Em",
];

// Sessions as sequences of transitions

type SessionAction =
  | { readonly type: "receive"; readonly version: ChordChartVersion }
  | { readonly type: "receiveConflict"; readonly version: ChordChartVersion }
  | { readonly type: "editChart"; readonly chart: string }
  | { readonly type: "editKey"; readonly key: string | null }
  | { readonly type: "editLayout"; readonly layout: ChordChartLayout }
  | { readonly type: "setDraft"; readonly draft: ChordChartDraft }
  | {
      readonly type: "import";
      readonly text: ChordChartImportText;
      readonly mode: (typeof IMPORT_MODES)[number];
    }
  | { readonly type: "transpose"; readonly key: string }
  | { readonly type: "beginSave"; readonly sent?: ChordChartDraft }
  | { readonly type: "saveSucceeded"; readonly updatedAt: string | null }
  | { readonly type: "saveFailed"; readonly refusedAsStale: boolean }
  | { readonly type: "adoptTheirs" }
  | { readonly type: "keepMine" }
  | { readonly type: "revert" }
  | { readonly type: "discardUnsaved" }
  /** Leaves and comes back: what storage kept, started over Planning Center's version. */
  | { readonly type: "reload"; readonly server: ChordChartVersion };

interface SessionSequence {
  readonly server: ChordChartVersion;
  readonly stored: StoredChordChartSession | null;
  /** Epoch milliseconds, for what storage records. */
  readonly now: number;
  readonly actions: readonly SessionAction[];
}

const apply = (
  session: ChordChartSession,
  action: SessionAction,
  now: number
): ChordChartSession => {
  switch (action.type) {
    case "receive": {
      return receiveChordChartVersion(session, action.version);
    }
    case "receiveConflict": {
      return receiveConflictVersion(session, action.version);
    }
    case "editChart": {
      return editChordChartDraft(session, (current) => ({
        ...current,
        chart: action.chart,
      }));
    }
    case "editKey": {
      return editChordChartDraft(session, (current) => ({
        ...current,
        key: action.key,
      }));
    }
    case "editLayout": {
      return editChordChartDraft(session, (current) => ({
        ...current,
        layout: action.layout,
      }));
    }
    case "setDraft": {
      return editChordChartDraft(session, () => action.draft);
    }
    case "import": {
      return editChordChartDraft(session, (current) =>
        importIntoChordChart(current, action.text, action.mode)
      );
    }
    case "transpose": {
      return editChordChartDraft(session, (current) =>
        transposeChordChartDraft(current, action.key)
      );
    }
    case "beginSave": {
      return beginChordChartSave(session, action.sent ?? session.draft);
    }
    case "saveSucceeded": {
      return chordChartSaveSucceeded(session, action.updatedAt);
    }
    case "saveFailed": {
      return chordChartSaveFailed(session, action.refusedAsStale);
    }
    case "adoptTheirs": {
      return adoptTheirChordChart(session);
    }
    case "keepMine": {
      return keepMyChordChart(session);
    }
    case "revert": {
      return revertChordChart(session);
    }
    case "discardUnsaved": {
      return discardUnsavedChordChart(session);
    }
    case "reload": {
      return startChordChartSession(
        action.server,
        storedChordChartSession(session, now)
      );
    }
    default: {
      throw new Error("Unknown session action");
    }
  }
};

/** Every combination of Save as you type's options, enabled, canEdit, then held. */
const SAVE_AS_YOU_TYPE_OPTIONS: readonly SaveAsYouTypeOptions[] = [
  false,
  true,
].flatMap((enabled) =>
  [false, true].flatMap((canEdit) =>
    [false, true].map((held) => ({ enabled, canEdit, held }))
  )
);

/** Everything the editor reads from a session, as `use-chord-chart-workspace.ts` does. */
const observe = (session: ChordChartSession, now: number) => ({
  session,
  isDirty: isDirty(session),
  saveStatus: chordChartSaveStatus(session),
  saveRequest: chordChartSaveRequest(session),
  copy: chordChartCopy(session),
  canSave: [false, true].map((canEdit) => canSaveChordChart(session, canEdit)),
  savesAsYouType: SAVE_AS_YOU_TYPE_OPTIONS.map((options) =>
    savesAsYouType(session, options)
  ),
  stored: storedChordChartSession(session, now),
  restoredNotice:
    session.restored && session.conflict === null && isDirty(session),
  revertable: !isSameDraft(session.draft, session.opening),
  savedChanges: !isSameDraft(session.base, session.opening),
});

const replay = ({ server, stored, now, actions }: SessionSequence) => {
  let session = startChordChartSession(server, stored);
  const steps = [observe(session, now)];
  for (const action of actions) {
    session = apply(session, action, now);
    steps.push(observe(session, now));
  }
  return steps;
};

const fresh = (
  chart: string,
  updatedAt: string | null,
  actions: readonly SessionAction[]
): SessionSequence => ({
  server: version(chart, updatedAt),
  stored: null,
  now: NOW,
  actions,
});

const editChart = (chart: string): SessionAction => ({
  type: "editChart",
  chart,
});
const BEGIN_SAVE: SessionAction = { type: "beginSave" };
const saveSucceeded = (updatedAt: string | null): SessionAction => ({
  type: "saveSucceeded",
  updatedAt,
});
const receive = (chart: string, updatedAt: string | null): SessionAction => ({
  type: "receive",
  version: version(chart, updatedAt),
});
const receiveConflict = (
  chart: string,
  updatedAt: string | null
): SessionAction => ({
  type: "receiveConflict",
  version: version(chart, updatedAt),
});
const REFUSED: readonly SessionAction[] = [
  editChart("VERSE mine"),
  BEGIN_SAVE,
  { type: "saveFailed", refusedAsStale: true },
];

/** Every test in chord-chart-session.test.ts, as a sequence. */
const SEED_SEQUENCES: readonly SessionSequence[] = [
  fresh("VERSE", V1, [editChart("VERSE 1")]),
  {
    server: version("VERSE", V1),
    stored: {
      savedAt: NOW,
      baseUpdatedAt: V1,
      draft: draft("VERSE mine"),
      opening: draft("VERSE before"),
    },
    now: NOW,
    actions: [],
  },
  {
    server: version("VERSE theirs", V2),
    stored: {
      savedAt: NOW,
      baseUpdatedAt: V1,
      draft: draft("VERSE mine"),
      opening: draft("VERSE"),
    },
    now: NOW,
    actions: [editChart("VERSE more")],
  },
  ...[version("VERSE saved", V2), version("VERSE theirs", V3)].map(
    (server): SessionSequence => ({
      server,
      stored: {
        savedAt: NOW,
        baseUpdatedAt: V2,
        draft: null,
        opening: draft("VERSE original"),
      },
      now: NOW,
      actions: [],
    })
  ),
  fresh("VERSE stale", V1, [receive("VERSE fresh", V2)]),
  fresh("VERSE", V1, [editChart("VERSE mine"), receive("VERSE theirs", V2)]),
  fresh("VERSE", V2, [
    receive("VERSE", V2),
    receive("OLD", V1),
    editChart("A"),
    { type: "beginSave", sent: draft("A") },
    receive("A", V3),
  ]),
  fresh("VERSE", V1, [
    editChart("mine"),
    receive("theirs", V2),
    receive("theirs again", V3),
  ]),
  fresh("VERSE", V1, [
    editChart("VERSE\n[G]Amazing  "),
    BEGIN_SAVE,
    saveSucceeded(V2),
    receive("VERSE\n[G]Amazing", V2),
  ]),
  fresh("VERSE", V1, [
    editChart("A"),
    BEGIN_SAVE,
    editChart("AB"),
    saveSucceeded(V2),
  ]),
  fresh("VERSE", V1, [
    editChart("A"),
    BEGIN_SAVE,
    { type: "saveFailed", refusedAsStale: false },
    editChart("AB"),
  ]),
  fresh("VERSE", V1, [
    ...REFUSED,
    receiveConflict("VERSE theirs", V2),
    editChart("VERSE mine, later"),
    { type: "keepMine" },
  ]),
  fresh("VERSE", V1, [
    ...REFUSED,
    { type: "keepMine" },
    { type: "adoptTheirs" },
  ]),
  fresh("VERSE", V1, [
    ...REFUSED,
    receiveConflict("VERSE theirs", V2),
    { type: "adoptTheirs" },
  ]),
  fresh("VERSE", V1, [
    editChart("mine"),
    receive("theirs", V2),
    { type: "reload", server: version("theirs", V2) },
  ]),
  fresh("VERSE", V1, []),
  fresh("VERSE", V1, [
    editChart("CHORUS"),
    BEGIN_SAVE,
    saveSucceeded(V2),
    { type: "revert" },
  ]),
  fresh("VERSE", V1, [
    {
      type: "setDraft",
      draft: draft("CHORUS", "G", { ...LAYOUT, columns: 1 }),
    },
    BEGIN_SAVE,
    saveSucceeded(V2),
  ]),
  // The workspace: Undo after a replacing import, a copy to a new arrangement, transposing.
  fresh("[G]Grace", V1, [
    { type: "import", text: { chart: "NEW", key: "Gb" }, mode: "replace" },
    { type: "setDraft", draft: draft("[G]Grace") },
    { type: "import", text: { chart: "[D]More", key: null }, mode: "append" },
    { type: "transpose", key: "A" },
    { type: "discardUnsaved" },
    { type: "reload", server: version("[G]Grace", V1) },
  ]),
  fresh("VERSE", null, [
    editChart("A"),
    receive("THEIRS", null),
    receive("THEIRS", V1),
    receiveConflict("LATER", null),
    receiveConflict("LATER", V2),
    { type: "keepMine" },
    BEGIN_SAVE,
    saveSucceeded(null),
  ]),
];

const randomDraft = (random: () => number): ChordChartDraft =>
  draft(pick(random, CHARTS), pick(random, KEYS), pick(random, LAYOUTS));

const randomVersion = (random: () => number): ChordChartVersion => ({
  draft: random() < 0.6 ? draft(pick(random, CHARTS)) : randomDraft(random),
  updatedAt: pick(random, VERSION_TIMES),
});

const ACTION_WEIGHTS: readonly SessionAction["type"][] = [
  "editChart",
  "editChart",
  "editChart",
  "editChart",
  "editKey",
  "editLayout",
  "setDraft",
  "import",
  "transpose",
  "receive",
  "receive",
  "receive",
  "receiveConflict",
  "receiveConflict",
  "beginSave",
  "beginSave",
  "beginSave",
  "saveSucceeded",
  "saveSucceeded",
  "saveFailed",
  "saveFailed",
  "adoptTheirs",
  "keepMine",
  "revert",
  "discardUnsaved",
  "reload",
];

const randomAction = (random: () => number): SessionAction => {
  const type = pick(random, ACTION_WEIGHTS);
  switch (type) {
    case "receive":
    case "receiveConflict": {
      return { type, version: randomVersion(random) };
    }
    case "editChart": {
      return { type, chart: pick(random, CHARTS) };
    }
    case "editKey": {
      return { type, key: pick(random, KEYS) };
    }
    case "editLayout": {
      return { type, layout: pick(random, LAYOUTS) };
    }
    case "setDraft": {
      return { type, draft: randomDraft(random) };
    }
    case "import": {
      return {
        type,
        text: pick(random, IMPORT_TEXTS),
        mode: pick(random, IMPORT_MODES),
      };
    }
    case "transpose": {
      return { type, key: pick(random, TRANSPOSE_TARGETS) };
    }
    case "beginSave": {
      return random() < 0.85 ? { type } : { type, sent: randomDraft(random) };
    }
    case "saveSucceeded": {
      return { type, updatedAt: pick(random, VERSION_TIMES) };
    }
    case "saveFailed": {
      return { type, refusedAsStale: random() < 0.5 };
    }
    case "reload": {
      return { type, server: randomVersion(random) };
    }
    case "adoptTheirs":
    case "keepMine":
    case "revert":
    case "discardUnsaved": {
      return { type };
    }
    default: {
      throw new Error("Unknown session action");
    }
  }
};

/** Storage from an earlier visit, often on the version Planning Center still holds. */
const randomStored = (
  random: () => number,
  now: number,
  server: ChordChartVersion
): StoredChordChartSession | null =>
  random() < 0.5
    ? null
    : {
        savedAt: now - Math.floor(random() * 3) * 86_400_000,
        baseUpdatedAt:
          random() < 0.5 ? server.updatedAt : pick(random, VERSION_TIMES),
        draft: random() < 0.25 ? null : randomDraft(random),
        opening: randomDraft(random),
      };

const RANDOM_SEQUENCES: readonly SessionSequence[] = (() => {
  const random = createRandom(1_002_026);
  return Array.from({ length: 70 }, () => {
    const now = NOW + Math.floor(random() * 1000) * 60_000;
    const server = randomVersion(random);
    return {
      server,
      stored: randomStored(random, now, server),
      now,
      actions: Array.from({ length: 1 + Math.floor(random() * 8) }, () =>
        randomAction(random)
      ),
    };
  });
})();

// Starting sessions

const START_SERVERS: readonly ChordChartVersion[] = [
  version("VERSE", V1),
  version("VERSE theirs", V2),
  version("VERSE", null),
  version("VERSE", "2026-09-01T12:00:00.000Z"),
  { draft: draft("VERSE", "G", { ...LAYOUT, columns: 1 }), updatedAt: V1 },
  { draft: draft("é"), updatedAt: V1 },
];

const START_STORED: readonly (StoredChordChartSession | null)[] = [
  null,
  ...[V1, V2, null].flatMap((baseUpdatedAt) =>
    [
      null,
      draft("VERSE"),
      draft("VERSE mine"),
      draft("VERSE", "G", { ...LAYOUT, columns: 1 }),
      draft(`e${COMBINING_ACUTE}`),
    ].map((stored) => ({
      savedAt: NOW - 1000,
      baseUpdatedAt,
      draft: stored,
      opening: draft("VERSE before"),
    }))
  ),
];

// Stored sessions as the draft store reads them back

const storedText = (session: StoredChordChartSession) =>
  JSON.stringify(session);

const TEST_STORED: StoredChordChartSession = {
  savedAt: NOW,
  baseUpdatedAt: "2026-09-01T12:00:00Z",
  draft: draft("VERSE\n[G]Amazing", "G", { ...LAYOUT, font: null }),
  opening: draft("VERSE", "G", { ...LAYOUT, font: null }),
};

/** What a stored field may be replaced with, valid or not. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const withField = (field: string, value: JsonValue): string =>
  JSON.stringify({ ...TEST_STORED, [field]: value });

const withDraftField = (field: string, value: JsonValue): string =>
  JSON.stringify({
    ...TEST_STORED,
    draft: { ...TEST_STORED.draft, [field]: value },
  });

const withOpeningLayout = (layout: JsonValue): string =>
  JSON.stringify({
    ...TEST_STORED,
    opening: { ...TEST_STORED.opening, layout },
  });

/** Stored sessions, each missing one field the schema requires. */
const MISSING_FIELD_TEXTS: readonly string[] = (() => {
  const { savedAt, baseUpdatedAt, draft: unsaved, opening } = TEST_STORED;
  const { chart, layout } = opening;
  const { font, fontSize, columns, chordColor, pageSize, orientation, margin } =
    LAYOUT;
  return [
    JSON.stringify({ baseUpdatedAt, draft: unsaved, opening }),
    JSON.stringify({ savedAt, draft: unsaved, opening }),
    JSON.stringify({ savedAt, baseUpdatedAt, opening }),
    JSON.stringify({ savedAt, baseUpdatedAt, draft: unsaved }),
    JSON.stringify({ ...TEST_STORED, draft: { chart, layout } }),
    withOpeningLayout({
      fontSize,
      columns,
      chordColor,
      pageSize,
      orientation,
      margin,
    }),
    withOpeningLayout({
      font,
      columns,
      chordColor,
      pageSize,
      orientation,
      margin,
    }),
    withOpeningLayout({
      font,
      fontSize,
      columns,
      chordColor,
      pageSize,
      orientation,
    }),
  ];
})();

interface StoredTextInput {
  readonly raw: string | null;
  readonly now: number;
}

const STORED_TEXTS: readonly StoredTextInput[] = [
  { raw: storedText(TEST_STORED), now: NOW },
  { raw: storedText(TEST_STORED), now: NOW + CHORD_CHART_DRAFT_LIFETIME_MS },
  {
    raw: storedText(TEST_STORED),
    now: NOW + CHORD_CHART_DRAFT_LIFETIME_MS + 1,
  },
  { raw: storedText(TEST_STORED), now: NOW - 86_400_000 },
  {
    raw: JSON.stringify({
      chart: "VERSE",
      key: "G",
      layout: LAYOUT,
      baseUpdatedAt: null,
    }),
    now: NOW,
  },
  { raw: "{not json", now: NOW },
  { raw: null, now: NOW },
  { raw: "", now: NOW },
  { raw: "null", now: NOW },
  { raw: "[]", now: NOW },
  { raw: "42", now: NOW },
  { raw: "{}", now: NOW },
  { raw: withField("draft", null), now: NOW },
  { raw: withField("baseUpdatedAt", null), now: NOW },
  { raw: withField("savedAt", "1"), now: NOW },
  { raw: withField("savedAt", null), now: NOW },
  { raw: withField("savedAt", 1.5e12), now: NOW },
  { raw: withField("savedAt", -1), now: NOW },
  { raw: withField("savedAt", 0), now: CHORD_CHART_DRAFT_LIFETIME_MS },
  { raw: withField("savedAt", 0), now: CHORD_CHART_DRAFT_LIFETIME_MS + 1 },
  { raw: withField("baseUpdatedAt", 5), now: NOW },
  { raw: withField("opening", null), now: NOW },
  { raw: withField("extra", { nested: [1, 2] }), now: NOW },
  ...MISSING_FIELD_TEXTS.map((raw) => ({ raw, now: NOW })),
  { raw: withDraftField("key", null), now: NOW },
  { raw: withDraftField("key", 7), now: NOW },
  { raw: withDraftField("chart", 7), now: NOW },
  { raw: withDraftField("chart", null), now: NOW },
  { raw: withDraftField("layout", null), now: NOW },
  { raw: withDraftField("layout", { ...LAYOUT, fontSize: "12" }), now: NOW },
  { raw: withDraftField("layout", { ...LAYOUT, fontSize: 12.5 }), now: NOW },
  { raw: withDraftField("layout", { ...LAYOUT, columns: null }), now: NOW },
  { raw: withDraftField("layout", { ...LAYOUT, font: 3 }), now: NOW },
  { raw: withDraftField("layout", { ...LAYOUT, extra: true }), now: NOW },
  { raw: ` ${storedText(TEST_STORED)}\n`, now: NOW },
  { raw: `${storedText(TEST_STORED)}x`, now: NOW },
  ...RANDOM_SEQUENCES.flatMap((sequence) => {
    const steps = replay(sequence);
    const last = steps.at(-1)?.stored ?? null;
    return last === null
      ? []
      : [
          { raw: storedText(last), now: sequence.now },
          {
            raw: storedText(last),
            now: last.savedAt + CHORD_CHART_DRAFT_LIFETIME_MS + 1,
          },
        ];
  }).slice(0, 40),
];

// Arrangements

const arrangement = (
  overrides: Partial<ChordChartArrangement> = {}
): ChordChartArrangement => ({
  id: "arr-1",
  name: "Default",
  archived: false,
  chordChart: "VERSE\n[G]Amazing",
  chordChartKey: "G",
  lyrics: "Amazing",
  keys: [{ id: "key-1", name: "Default", startingKey: "G", endingKey: null }],
  layout: LAYOUT,
  updatedAt: V1,
  ...overrides,
});

const ARRANGEMENTS: readonly ChordChartArrangement[] = [
  arrangement(),
  arrangement({ chordChartKey: null, updatedAt: null }),
  arrangement({ chordChart: "", layout: UNSET_LAYOUT, keys: [] }),
  arrangement({ archived: true, chordChart: "é", updatedAt: "garbled" }),
];

export const chordChartSessionParitySuites: readonly ParitySuite[] = [
  defineParitySuite({
    name: "chordsession.constants",
    cases: [null],
    run: () => ({
      saveAsYouTypePauseMs: SAVE_AS_YOU_TYPE_PAUSE_MS,
      draftLifetimeMs: CHORD_CHART_DRAFT_LIFETIME_MS,
    }),
  }),
  defineParitySuite({
    name: "chordsession.dateParse",
    cases: TIMESTAMPS.filter((value) => value !== null),
    run: parsedTime,
  }),
  defineParitySuite({
    name: "chordsession.isNewerVersion",
    cases: TIMESTAMPS.flatMap((candidate) =>
      TIMESTAMPS.filter((_, index) => index % 3 === 0 || index < 8).map(
        (known) => ({ candidate, known })
      )
    ),
    run: ({ candidate, known }) => isNewerVersion(candidate, known),
  }),
  defineParitySuite({
    name: "chordsession.isSameDraft",
    cases: DRAFTS.flatMap((left) => DRAFTS.map((right) => ({ left, right }))),
    run: ({ left, right }) => isSameDraft(left, right),
  }),
  defineParitySuite({
    name: "chordsession.changedLayout",
    cases: LAYOUTS.flatMap((layout) =>
      LAYOUTS.map((reference) => ({ layout, reference }))
    ),
    run: ({ layout, reference }) => changedLayout(layout, reference),
  }),
  defineParitySuite({
    name: "chordsession.importIntoChordChart",
    cases: [
      // The cases in chord-chart-session.test.ts first.
      {
        draft: draft("OLD"),
        text: { chart: "NEW", key: null },
        mode: "replace",
      },
      {
        draft: draft("OLD"),
        text: { chart: "NEW", key: "Gb" },
        mode: "replace",
      },
      { draft: draft("A\n\n"), text: { chart: "B", key: "D" }, mode: "append" },
      { draft: draft("  \n"), text: { chart: "B", key: null }, mode: "append" },
      ...IMPORT_CHARTS.flatMap((chart, index) =>
        IMPORT_TEXTS.flatMap((text) =>
          IMPORT_MODES.map((mode) => ({
            draft: draft(chart, KEYS[index % KEYS.length] ?? null),
            text,
            mode,
          }))
        )
      ),
    ] satisfies {
      draft: ChordChartDraft;
      text: ChordChartImportText;
      mode: (typeof IMPORT_MODES)[number];
    }[],
    run: ({ draft: current, text, mode }) =>
      importIntoChordChart(current, text, mode),
  }),
  defineParitySuite({
    name: "chordsession.transposeChordChartDraft",
    cases: TRANSPOSE_CHARTS.flatMap((chart) =>
      TRANSPOSE_KEYS.flatMap((key) =>
        TRANSPOSE_TARGETS.map((target) => ({
          draft: draft(chart, key),
          target,
        }))
      )
    ),
    run: ({ draft: current, target }) =>
      transposeChordChartDraft(current, target),
  }),
  defineParitySuite({
    name: "chordsession.versionOf",
    cases: ARRANGEMENTS,
    run: versionOf,
  }),
  defineParitySuite({
    name: "chordsession.start",
    cases: START_SERVERS.flatMap((server) =>
      START_STORED.map((stored) => ({ server, stored }))
    ),
    run: ({ server, stored }) => startChordChartSession(server, stored),
  }),
  defineParitySuite({
    name: "chordsession.sequences",
    cases: [...SEED_SEQUENCES, ...RANDOM_SEQUENCES],
    run: replay,
  }),
  defineParitySuite({
    name: "chordsession.storedSession",
    cases: STORED_TEXTS,
    run: ({ raw, now }) => parseStoredChordChartSession(raw, now),
  }),
];
