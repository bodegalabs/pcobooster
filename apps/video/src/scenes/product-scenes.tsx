import { CandidateList } from "../../../marketing/src/components/product-demo/assign-view";
import {
  transposeChart,
  updateChordChart,
} from "../../../marketing/src/components/product-demo/chart-model";
import {
  addAssignment,
  navigateDemo,
} from "../../../marketing/src/components/product-demo/demo-model";
import type { PlanView } from "../../../marketing/src/components/product-demo/demo-model";
import { chordCharts } from "../../../marketing/src/components/product-demo/fixtures";
import { updatePlanItem } from "../../../marketing/src/components/product-demo/plan-model";
import {
  ChordChartShowcase,
  PeopleShowcase,
  ProductDemo,
} from "../../../marketing/src/components/product-demo/product-demo";
import { FeatureScene } from "../components/feature-scene";
import type { Caption } from "../components/feature-scene";
import type { Lines } from "../components/headline";
import { SavedToast } from "../components/saved-toast";
import type { Shot } from "../lib/camera";
import { useFormat } from "../lib/format";
import type { CursorStep, Highlight } from "../lib/product-stage";
import type { Beat, Target } from "../lib/replica";

import styles from "../../../marketing/src/components/product-demo/product-demo.module.css";

/*
 * Feature scenes over the marketing site's product replica: fictional people, original
 * sample songs, the product's own rules. Each scene's beats, camera, and cursor are in
 * scene-local frames.
 */

const css = (selector: string): Target => ({ selector });

const showView = (view: PlanView | "people") => () => {
  navigateDemo({ view, positionId: "acoustic" });
};

const OPEN_ACOUSTIC = css('[aria-label="Fill 1 open Acoustic Guitar slot"]');
const ADD_HAYDEN = css('[aria-label="Add Hayden Collins to this position"]');
const ACOUSTIC_FILLED = css('[aria-label="2 of 2 filled"]');
/** Hayden Collins, the best-rested acoustic player in the sample roster. */
const HAYDEN = "p02";
const FILL_LINES: Lines = ["Every team, filled.", "*With the right people.*"];

/**
 * Filling a team: from the lineup's open spot (or straight into Assign for short cuts),
 * add the top-ranked person and the position reads full.
 */
export const FillTeamsScene = ({
  duration,
  fromLineup = true,
  lines = FILL_LINES,
}: {
  duration: number;
  fromLineup?: boolean;
  lines?: Lines;
}) => {
  const openAt = fromLineup ? 44 : 0;
  const addAt = fromLineup ? openAt + 52 : 40;
  const add: Beat = {
    at: addAt + 3,
    apply: () => {
      addAssignment("acoustic", HAYDEN);
    },
  };
  const beats: Beat[] = fromLineup
    ? [
        { at: 0, apply: showView("lineup") },
        { at: openAt + 3, apply: showView("assign") },
        add,
      ]
    : [{ at: 0, apply: showView("assign") }, add];
  const cursor: CursorStep[] = [
    ...(fromLineup ? [{ at: openAt, target: OPEN_ACOUSTIC, click: true }] : []),
    {
      at: addAt,
      target: ADD_HAYDEN,
      click: true,
      travel: fromLineup ? 26 : 22,
    },
  ];
  const shots: Shot[] = [
    ...(fromLineup ? [{ at: 4, target: OPEN_ACOUSTIC, zoom: 1.3 }] : []),
    {
      at: openAt + 6,
      target: ADD_HAYDEN,
      zoom: 1.45,
      beat: fromLineup ? 1 : 0,
    },
    { at: addAt + 18, target: ACOUSTIC_FILLED, zoom: 1.3 },
  ];

  return (
    <FeatureScene
      duration={duration}
      lines={lines}
      beats={beats}
      shots={shots}
      cursor={cursor}
      highlights={[{ from: addAt + 16, to: duration, target: ACOUSTIC_FILLED }]}
    >
      <ProductDemo />
    </FeatureScene>
  );
};

const BUSY_SUNDAY = css('[aria-label^="Sun, Sep 20:"]');
const PEEK_AT = 64;
const HISTORY_BEATS: readonly Beat[] = [
  { at: 0 },
  { at: PEEK_AT + 2, focus: [BUSY_SUNDAY] },
];
const HISTORY_CURSOR: readonly CursorStep[] = [
  { at: PEEK_AT, target: BUSY_SUNDAY, travel: 26 },
];
const HISTORY_SHOTS: readonly Shot[] = [
  { at: 0 },
  {
    at: PEEK_AT - 18,
    target: BUSY_SUNDAY,
    zoom: 1.5,
    portraitZoom: 1.4,
    duration: 30,
  },
];

/** One acoustic candidate's last month and next, with a busy Sunday opening up. */
export const HistoryScene = ({ duration }: { duration: number }) => (
  <FeatureScene
    duration={duration}
    lines={["A little history.", "*A better ask.*"]}
    beats={HISTORY_BEATS}
    cursor={HISTORY_CURSOR}
    shots={HISTORY_SHOTS}
    revealAt={10}
  >
    <div className={`${styles.demo} ${styles.embedded}`}>
      <div className={styles.content}>
        <h3 className={styles["position-heading"]}>
          Acoustic Guitar<span>Band</span>
        </h3>
        <CandidateList positionId="acoustic" limit={4} compact />
      </div>
    </div>
  </FeatureScene>
);

const CHECK_IN: Target = {
  selector: "h3",
  text: "Check in",
  closest: "section",
};
const HEAVY_LOAD: Target = { selector: "span", text: "Heavy load" };
const DECLINING: Target = { selector: "span", text: "Declining" };
const HEALTH_ZOOM_AT = 46;
const HEALTH_BEATS: readonly Beat[] = [{ at: 0, apply: showView("people") }];
const HEALTH_SHOTS: readonly Shot[] = [
  { at: 0 },
  { at: HEALTH_ZOOM_AT, target: CHECK_IN, pad: 18, duration: 32 },
];

/** Team health and who to check in with. */
export const TeamHealthScene = ({ duration }: { duration: number }) => {
  const portrait = useFormat() === "portrait";
  return (
    <FeatureScene
      duration={duration}
      lines={["Care for your people.", "*Not just the schedule.*"]}
      beats={HEALTH_BEATS}
      shots={HEALTH_SHOTS}
      highlights={[
        { from: HEALTH_ZOOM_AT + 30, to: duration, target: HEAVY_LOAD },
        { from: HEALTH_ZOOM_AT + 40, to: duration, target: DECLINING },
      ]}
    >
      {portrait ? <PeopleShowcase /> : <ProductDemo />}
    </FeatureScene>
  );
};

const KEY_CHIP = css('[aria-label="Key Eb, change key for Steady Ground"]');
const NEW_KEY = css('[aria-label="Key D, change key for Steady Ground"]');
const PICK_D: Target = { selector: '[role="menuitem"]', text: "D" };
const TIMES_TAB: Target = { selector: "button", text: "Times" };
const KEY_OPEN_AT = 46;
const KEY_PICK_AT = KEY_OPEN_AT + 30;
const TIMES_AT = KEY_PICK_AT + 52;

/** Change a song's key from the run sheet, then hop to service times. */
export const RunSheetScene = ({
  duration,
  withTimes = true,
}: {
  duration: number;
  withTimes?: boolean;
}) => {
  const beats: Beat[] = [
    { at: 0, apply: showView("plan") },
    { at: KEY_OPEN_AT + 3, clicks: [KEY_CHIP] },
    {
      at: KEY_PICK_AT + 3,
      apply: () => {
        updatePlanItem("i5", { songKey: "D" });
      },
    },
    ...(withTimes ? [{ at: TIMES_AT + 3, apply: showView("times") }] : []),
  ];
  return (
    <FeatureScene
      duration={duration}
      lines={
        withTimes
          ? ["The run sheet and times.", "*Set in a click.*"]
          : ["The run sheet,", "*set in a click.*"]
      }
      beats={beats}
      cursor={[
        { at: KEY_OPEN_AT, target: KEY_CHIP, click: true, travel: 24 },
        { at: KEY_PICK_AT, target: PICK_D, click: true },
        ...(withTimes
          ? [{ at: TIMES_AT, target: TIMES_TAB, click: true, travel: 26 }]
          : []),
      ]}
      shots={[
        { at: 0 },
        { at: KEY_OPEN_AT - 22, target: KEY_CHIP, zoom: 1.6, duration: 30 },
        ...(withTimes ? [{ at: TIMES_AT - 26, duration: 28 }] : []),
      ]}
      highlights={[
        {
          from: KEY_PICK_AT + 8,
          to: withTimes ? TIMES_AT - 6 : duration,
          target: NEW_KEY,
        },
      ]}
    >
      <ProductDemo />
    </FeatureScene>
  );
};

const TRANSPOSE = css('[aria-label="Transpose chords"]');
const PICK_A: Target = { selector: '[role="menuitem"]', text: "A" };
const WRITTEN_KEY = css('[aria-label="Key the chords are written in"]');
const PREVIEW_KEY = css('[aria-label="Preview the chords in"]');
const PREVIEW = css('[aria-label="Preview"]');
const CHART_OPEN_AT = 40;
const CHART_PICK_AT = CHART_OPEN_AT + 30;
const CHART_BEATS: readonly Beat[] = [
  { at: 0 },
  { at: CHART_OPEN_AT + 3, clicks: [TRANSPOSE] },
  {
    at: CHART_PICK_AT + 3,
    apply: () => {
      const chart = chordCharts.get("s1");
      if (chart !== undefined) {
        updateChordChart("s1", {
          key: "A",
          chart: transposeChart(chart.chart, chart.key, "A"),
        });
      }
    },
  },
];
const CHART_CURSOR: readonly CursorStep[] = [
  { at: CHART_OPEN_AT, target: TRANSPOSE, click: true, travel: 24 },
  { at: CHART_PICK_AT, target: PICK_A, click: true },
];
const CHART_SHOTS: readonly Shot[] = [
  { at: 0 },
  {
    at: CHART_OPEN_AT - 20,
    target: TRANSPOSE,
    zoom: 1.35,
    portraitZoom: 1.5,
    duration: 30,
  },
  { at: CHART_PICK_AT + 14, target: PREVIEW, zoom: 1, duration: 34 },
];

/** Transpose the whole chart in one step; the preview follows. */
export const ChordChartScene = ({ duration }: { duration: number }) => {
  const portrait = useFormat() === "portrait";
  return (
    <FeatureScene
      duration={duration}
      lines={["Songs, keys, and charts.", "*Ready before rehearsal.*"]}
      beats={CHART_BEATS}
      cursor={CHART_CURSOR}
      shots={CHART_SHOTS}
      highlights={[
        { from: CHART_PICK_AT + 10, to: duration, target: WRITTEN_KEY },
        ...(portrait
          ? []
          : [{ from: CHART_PICK_AT + 30, to: duration, target: PREVIEW_KEY }]),
      ]}
    >
      <ChordChartShowcase />
    </FeatureScene>
  );
};

const IMPORT_BUTTON = css('button[aria-label="Import lyrics or chords"]');
const IMPORT_MENU = css('dialog[aria-label="Import lyrics or chords"]');
const IMPORT_OPEN_AT = 36;
const IMPORT_SOURCES = [
  "ChordPro file, such as a SongSelect download",
  "Chords written above lyrics",
  "Chart with inline [chords]",
] as const;
const IMPORT_BEATS: readonly Beat[] = [
  { at: 0 },
  { at: IMPORT_OPEN_AT + 3, clicks: [IMPORT_BUTTON] },
];
const IMPORT_CURSOR: readonly CursorStep[] = [
  { at: IMPORT_OPEN_AT, target: IMPORT_BUTTON, click: true, travel: 24 },
];
const IMPORT_SHOTS: readonly Shot[] = [
  { at: 0 },
  {
    at: IMPORT_OPEN_AT + 6,
    target: IMPORT_MENU,
    zoom: 1.5,
    portraitZoom: 1.7,
    duration: 30,
  },
];
const IMPORT_HIGHLIGHTS: readonly Highlight[] = IMPORT_SOURCES.map(
  (text, index) => ({
    from: IMPORT_OPEN_AT + 30 + index * 14,
    to: IMPORT_OPEN_AT + 52 + index * 14,
    target: { selector: '[role="menuitem"]', text },
  })
);

/** The import sources the chart editor reads. */
export const ImportScene = ({ duration }: { duration: number }) => (
  <FeatureScene
    duration={duration}
    lines={["Bring in SongSelect,", "*ChordPro, or plain text.*"]}
    beats={IMPORT_BEATS}
    cursor={IMPORT_CURSOR}
    shots={IMPORT_SHOTS}
    highlights={IMPORT_HIGHLIGHTS}
  >
    <ChordChartShowcase />
  </FeatureScene>
);

const READINESS: Target = {
  selector: "h3",
  text: "Readiness",
  closest: "section",
};
const PEOPLE_CARD: Target = {
  selector: "h3",
  text: "People",
  closest: "section",
};
const NEEDS_SOMEONE: Target = {
  selector: "button",
  text: "7 positions need someone",
};
const ACOUSTIC_NEEDED: Target = {
  selector: "button",
  text: "Acoustic Guitar · Band",
};
const OVERVIEW_BEATS: readonly Beat[] = [
  { at: 0, apply: showView("overview") },
];
const OVERVIEW_SHOTS: readonly Shot[] = [
  { at: 0 },
  { at: 30, target: READINESS, pad: 20, duration: 32 },
  { at: 84, target: PEOPLE_CARD, pad: 20, duration: 32 },
];

/** The plan's overview: what's left to do this week, at a glance. */
export const OverviewScene = ({ duration }: { duration: number }) => (
  <FeatureScene
    duration={duration}
    lines={["See the whole Sunday", "*at a glance.*"]}
    beats={OVERVIEW_BEATS}
    shots={OVERVIEW_SHOTS}
    highlights={[
      { from: 52, to: 82, target: NEEDS_SOMEONE },
      { from: 106, to: duration, target: ACOUSTIC_NEEDED },
    ]}
  >
    <ProductDemo />
  </FeatureScene>
);

/*
 * Launch scenes: one job carried all the way through, then quick beats that each open
 * already framed on their moment, for hard cuts at feed pace.
 */

/** Hayden's row and the rest of who's free, ranked. */
const CANDIDATES: Target = {
  selector: '[aria-label="Add Hayden Collins to this position"]',
  closest: "section",
};
const HAYDEN_ROW: Target = {
  selector: '[aria-label="Add Hayden Collins to this position"]',
  closest: "li",
};

/** Hayden's row once he is on the slot, still waiting on his answer. */
const HAYDEN_SCHEDULED: Target = {
  selector: '[aria-label="Pending. Change status for Hayden Collins"]',
  closest: "li",
};

interface FillPace {
  readonly open: number;
  readonly add: number;
  readonly saved: number;
}

const FILL_PACES = {
  full: { open: 40, add: 196, saved: 214 },
  quick: { open: 30, add: 132, saved: 148 },
} as const satisfies Record<string, FillPace>;

/**
 * Filling one open spot, start to finish: pick the open Acoustic Guitar slot on the
 * lineup, read who's free ranked by who's rested, add the top person, and see it saved.
 */
export const FillJobScene = ({
  duration,
  pace = "full",
}: {
  duration: number;
  pace?: keyof typeof FILL_PACES;
}) => {
  const { open, add, saved } = FILL_PACES[pace];
  const captions: Caption[] = [
    { at: 0, lines: ["Pick the open spot."] },
    {
      at: open + 8,
      lines: ["See who’s free,", "*ranked by who’s rested.*"],
    },
    {
      at: add + 6,
      lines: ["Add them in a click.", "*Saved to Planning Center.*"],
    },
  ];
  const beats: Beat[] = [
    { at: 0, apply: showView("lineup") },
    { at: open + 3, apply: showView("assign") },
    {
      at: add + 3,
      apply: () => {
        addAssignment("acoustic", HAYDEN);
      },
    },
  ];
  const cursor: CursorStep[] = [
    { at: open, target: OPEN_ACOUSTIC, click: true, travel: 18 },
    { at: add, target: ADD_HAYDEN, click: true, travel: 26, beat: 1 },
  ];
  const shots: Shot[] = [
    { at: 0, target: OPEN_ACOUSTIC, zoom: 2, duration: 1 },
    {
      at: open + 4,
      target: CANDIDATES,
      pad: 14,
      beat: 1,
      duration: 22,
    },
    {
      at: add - 34,
      target: HAYDEN_ROW,
      zoom: 2,
      beat: 1,
      duration: 26,
    },
    {
      at: add + 8,
      target: HAYDEN_SCHEDULED,
      zoom: 1.9,
      beat: 2,
      duration: 20,
    },
  ];

  return (
    <FeatureScene
      duration={duration}
      captions={captions}
      beats={beats}
      shots={shots}
      cursor={cursor}
      highlights={[
        { from: open + 40, to: add - 4, target: HAYDEN_ROW, beat: 1 },
        { from: add + 20, to: duration, target: HAYDEN_SCHEDULED },
      ]}
      revealAt={open + 8}
      transition="cut"
      overlay={<SavedToast at={saved} />}
    >
      <ProductDemo />
    </FeatureScene>
  );
};

/** Team health, opened on who to check in with. */
export const QuickHealthScene = ({ duration }: { duration: number }) => {
  const portrait = useFormat() === "portrait";
  return (
    <FeatureScene
      duration={duration}
      captions={[{ at: 0, lines: ["Notice who’s", "*carrying too much.*"] }]}
      beats={HEALTH_BEATS}
      shots={[
        {
          at: 0,
          target: CHECK_IN,
          pad: 12,
          duration: 1,
        },
      ]}
      highlights={[
        { from: 12, to: duration, target: HEAVY_LOAD },
        { from: 24, to: duration, target: DECLINING },
      ]}
      transition="cut"
    >
      {portrait ? <PeopleShowcase /> : <ProductDemo />}
    </FeatureScene>
  );
};

/** A song's key set straight from the run sheet. */
export const QuickKeyScene = ({ duration }: { duration: number }) => {
  const openAt = 18;
  const pickAt = openAt + 22;
  return (
    <FeatureScene
      duration={duration}
      captions={[{ at: 0, lines: ["Set keys", "*from the run sheet.*"] }]}
      beats={[
        { at: 0, apply: showView("plan") },
        { at: openAt + 3, clicks: [KEY_CHIP] },
        {
          at: pickAt + 3,
          apply: () => {
            updatePlanItem("i5", { songKey: "D" });
          },
        },
      ]}
      cursor={[
        { at: openAt, target: KEY_CHIP, click: true, travel: 14 },
        { at: pickAt, target: PICK_D, click: true, travel: 14 },
      ]}
      shots={[
        {
          at: 0,
          target: KEY_CHIP,
          zoom: 1.8,
          portraitZoom: 1.5,
          duration: 1,
        },
      ]}
      highlights={[{ from: pickAt + 6, to: duration, target: NEW_KEY }]}
      transition="cut"
    >
      <ProductDemo />
    </FeatureScene>
  );
};

/** The chart's text, where every chord has just been rewritten. */
const CHART_TEXT = css('[aria-label="Lyrics and chords"]');

/** A whole chart transposed in one step, the preview following. */
export const QuickTransposeScene = ({ duration }: { duration: number }) => {
  const openAt = 18;
  const pickAt = openAt + 22;
  return (
    <FeatureScene
      duration={duration}
      captions={[{ at: 0, lines: ["Transpose a chart", "*in one click.*"] }]}
      beats={[
        { at: 0 },
        { at: openAt + 3, clicks: [TRANSPOSE] },
        {
          at: pickAt + 3,
          apply: () => {
            const chart = chordCharts.get("s1");
            if (chart !== undefined) {
              updateChordChart("s1", {
                key: "A",
                chart: transposeChart(chart.chart, chart.key, "A"),
              });
            }
          },
        },
      ]}
      cursor={[
        { at: openAt, target: TRANSPOSE, click: true, travel: 14 },
        { at: pickAt, target: PICK_A, click: true, travel: 14 },
      ]}
      shots={[
        {
          at: 0,
          target: TRANSPOSE,
          zoom: 1.6,
          portraitZoom: 1.5,
          duration: 1,
        },
        { at: pickAt + 8, zoom: 1.7, target: CHART_TEXT, duration: 18 },
      ]}
      transition="cut"
    >
      <ChordChartShowcase />
    </FeatureScene>
  );
};
