import {
  addAssignment,
  navigateDemo,
} from "../../../marketing/src/components/product-demo/demo-model";
import type { PlanView } from "../../../marketing/src/components/product-demo/demo-model";
import {
  insertPlanItem,
  updatePlanItem,
} from "../../../marketing/src/components/product-demo/plan-model";
import {
  PeopleShowcase,
  ProductDemo,
} from "../../../marketing/src/components/product-demo/product-demo";
import { FeatureScene } from "../components/feature-scene";
import { SavedToast } from "../components/saved-toast";
import { useFormat } from "../lib/format";
import type { Beat, Target } from "../lib/replica";

import styles from "../../../marketing/src/components/product-demo/product-demo.module.css";

/*
 * The demo's story: planning one Sunday from the overview to the people behind it, in
 * the marketing site's replica (fictional people, original sample songs). Each scene
 * carries its earlier scenes' changes, so the plan stays one plan from start to finish.
 */

const css = (selector: string): Target => ({ selector });

const showView = (view: PlanView | "services" | "people") => () => {
  navigateDemo({ view, positionId: "acoustic" });
};

/** Hayden Collins, the best-rested acoustic player in the sample roster. */
const HAYDEN = "p02";
/** Open Doors, the last song in the worship set. */
const OPEN_DOORS = "i6";
/** Steady Ground, whose key the transitions scene moves from Eb to D. */
const STEADY_GROUND = "i5";

const addHayden = () => {
  addAssignment("acoustic", HAYDEN);
};
const addLanternHill = () => {
  insertPlanItem("song", OPEN_DOORS);
};
const steadyGroundInD = () => {
  updatePlanItem(STEADY_GROUND, { songKey: "D" });
};

// Assign
/** The band's roster, with its open spots, beside the open spot's name. */
const OPEN_SPOTS: Target = {
  ...css(`.${styles["assign-roster"]} .${styles["team-panel"]}`),
  with: css(`.${styles["position-heading"]}`),
};
const FRANKIE_ROW: Target = {
  selector: '[aria-label="Confirmed. Change status for Frankie Turner"]',
  closest: "li",
};
const DAY_CARD = css(`.${styles["day-card"]}`);
/** Frankie's row with the day's card open under it, framed as one. */
const FRANKIE_AND_DAY: Target = { ...FRANKIE_ROW, with: DAY_CARD };
/** Frankie's Thursday rehearsal, then the Sunday after it. */
const FRANKIE_REHEARSAL = css(
  '[aria-label="Thu, Sep 24: Band - Acoustic Guitar (rehearsal)"]'
);
const FRANKIE_SUNDAY = css(
  '[aria-label="Sun, Sep 27: Band - Acoustic Guitar"]'
);
/** Lands the pointer at the top of a day's column, beside its bar, not over it. */
const BESIDE_BAR = { x: 0.85, y: 0.08 } as const;
const HAYDEN_ROW: Target = {
  selector: '[aria-label="Add Hayden Collins to this position"]',
  closest: "li",
};
/** Hayden's fit, the only 100 on the list while the spot is open. */
const HAYDEN_FIT = css('[aria-label^="100 fit."]');
const EMERSON_ROW: Target = {
  selector: '[aria-label="Add Emerson Diaz to this position"]',
  closest: "li",
};
/** Hayden over Emerson, the first two of everyone who could take the spot. */
const TOP_TWO: Target = {
  ...HAYDEN_ROW,
  with: EMERSON_ROW,
};
/** Everyone who could take the spot, each with a fit and their month. */
const EVERYONE: Target = {
  selector: '[aria-label="Add Hayden Collins to this position"]',
  closest: `.${styles["candidate-section"]}`,
};
const ADD_HAYDEN = css('[aria-label="Add Hayden Collins to this position"]');
const HAYDEN_SCHEDULED: Target = {
  selector: '[aria-label="Pending. Change status for Hayden Collins"]',
  closest: "li",
};
/** Scheduled, now 2 of 2: Frankie, and Hayden asked. */
const SPOT_FILLED: Target = { ...FRANKIE_ROW, with: HAYDEN_SCHEDULED };
/** Tall enough to lay out everyone who could play, so the camera can pan down the list. */
const FILL_CANVAS = 1.4;
/** Fills the window with the people pane, just past the roster beside it. */
const PANE_ZOOM = 2.03;
/** Past the row's bottom-right corner, off the window: the pointer leaves after asking. */
const OUT_OF_THE_WAY = { x: 1.12, y: 1.5 } as const;

// Services
/** The plans the visitor is on, down to Sunday's row in the list below. */
const SUNDAY_PLAN = css(
  '[aria-label="Sunday Services, Sun, Oct 11, 2026: you are scheduled"]'
);
const ON_THE_NAME = { x: 0.18, y: 0.32 } as const;
const YOUR_SERVICES_AND_SUNDAY: Target = {
  ...css(`.${styles["your-services"]}`),
  with: SUNDAY_PLAN,
};

/**
 * Filling a spot, start to finish: Services lists every plan, Sunday's roster shows what's open, the open Acoustic
 * Guitar spot lists everyone who could play with their month around it, Frankie's
 * rehearsal and Sunday show what's on each day, Hayden's fit says why the most rested
 * ranks first, and one click asks Hayden and saves it.
 */
export const FillSundayScene = ({ duration }: { duration: number }) => {
  // Every click lands on the music's beat (20 frames). Services holds before Sunday is
  // picked, and the roster before the camera moves in, so the opening can breathe.
  const pickAt = 100;
  const openAt = pickAt + 3;
  const assignAt = 200;
  const rehearsalAt = 300;
  const sundayAt = 360;
  const rankedAt = 420;
  const addAt = 500;
  // The feed's zooms are tuned to its 1000px canvas; the wide canvas fits each subject.
  const wide = useFormat() === "landscape";
  const zoom = (feed: number) => (wide ? undefined : feed);
  const beats: Beat[] = [
    { at: 0, apply: showView("services") },
    { at: openAt, apply: showView("assign") },
    { at: rehearsalAt + 3, focus: [FRANKIE_REHEARSAL] },
    { at: sundayAt + 3, focus: [FRANKIE_SUNDAY] },
    { at: rankedAt + 3, focus: [HAYDEN_FIT] },
    { at: addAt + 3, apply: addHayden },
  ];
  return (
    <FeatureScene
      handOff
      transition="soft-in"
      duration={duration}
      captions={[
        { at: 0, lines: ["Start with Sunday."] },
        { at: pickAt + 6, lines: ["See what’s still open."] },
        {
          at: assignAt + 8,
          lines: ["Everyone who could play,", "*ranked by their last month.*"],
        },
        {
          at: rehearsalAt,
          lines: ["Every service and rehearsal,", "*at a glance.*"],
        },
        {
          at: rankedAt + 4,
          lines: ["The most rested", "*ranks first.*"],
        },
        {
          at: addAt + 6,
          lines: ["Ask in a click.", "*Saved to Planning Center.*"],
        },
      ]}
      beats={beats}
      shots={[
        // The whole app first, sidebar and all, then in toward Sunday's row.
        { at: 0, duration: 1 },
        { at: 30, target: YOUR_SERVICES_AND_SUNDAY, pad: 12, duration: 56 },
        // Sunday opens on the whole window, then a slow push in on its open spots.
        { at: openAt, beat: 1, duration: 1 },
        { at: openAt + 12, target: OPEN_SPOTS, pad: 16, beat: 1, duration: 78 },
        {
          // The best fits first, then back to reveal everyone who could play.
          at: assignAt + 6,
          target: TOP_TWO,
          zoom: zoom(PANE_ZOOM),
          beat: 1,
          duration: 26,
        },
        {
          at: assignAt + 40,
          target: EVERYONE,
          pad: 12,
          beat: 1,
          duration: 44,
        },
        {
          at: rehearsalAt - 16,
          target: FRANKIE_AND_DAY,
          zoom: zoom(2.1),
          beat: 2,
          duration: 26,
        },
        {
          at: rankedAt - 14,
          target: TOP_TWO,
          zoom: zoom(PANE_ZOOM),
          beat: 4,
          duration: 28,
        },
        {
          // Already easing toward the filled spot as the click lands, so the list's
          // change happens mid-move instead of as a jump.
          at: addAt,
          target: SPOT_FILLED,
          zoom: zoom(PANE_ZOOM),
          beat: 5,
          duration: 44,
        },
        {
          at: addAt + 44,
          target: SPOT_FILLED,
          zoom: zoom(2.12),
          beat: 5,
          duration: 80,
        },
      ]}
      cursor={[
        {
          at: pickAt,
          target: SUNDAY_PLAN,
          click: true,
          travel: 26,
          // On the service's name, not the empty middle of its row.
          anchor: ON_THE_NAME,
        },
        {
          at: rehearsalAt,
          target: FRANKIE_REHEARSAL,
          anchor: BESIDE_BAR,
          travel: 24,
          beat: 1,
        },
        {
          at: sundayAt,
          target: FRANKIE_SUNDAY,
          anchor: BESIDE_BAR,
          travel: 18,
          beat: 2,
        },
        {
          at: rankedAt,
          target: HAYDEN_FIT,
          click: true,
          travel: 24,
          beat: 3,
        },
        { at: addAt, target: ADD_HAYDEN, click: true, travel: 24, beat: 4 },
        {
          at: addAt + 48,
          target: HAYDEN_SCHEDULED,
          anchor: OUT_OF_THE_WAY,
          travel: 30,
          beat: 5,
        },
      ]}
      revealAt={openAt + 12}
      swaps={[openAt]}
      // Hayden's row moves up to Scheduled: the list crossfades instead of jumping.
      dissolves={[addAt + 3]}
      tallCanvas={FILL_CANVAS}
      overlay={<SavedToast at={addAt + 16} />}
    >
      <ProductDemo />
    </FeatureScene>
  );
};

// Plan
const ADD_AFTER_OPEN_DOORS = css('[aria-label="Add after Open Doors"]');
/** The "+" at the start of the insert line, which the cursor aims for. */
const INSERT_PLUS = css(
  `[aria-label="Add after Open Doors"] .${styles["insert-plus"]}`
);
const SONG_CHOICE: Target = { selector: '[role="menuitem"]', text: "Song" };
const OPEN_LANTERN_HILL = css('[aria-label="Open Lantern Hill"]');
const OPEN_DOORS_ROW: Target = {
  selector: '[aria-label="Open Open Doors"]',
  closest: "li",
};
const DETAILS = css('aside[aria-label="Details"]');
/** Clicks that reopen the new song's details on a beat's fresh mount. */
const KEEP_DETAILS: readonly Target[] = [OPEN_LANTERN_HILL];
const NO_CLICKS: readonly Target[] = [];
/** Morning Light (G) into Steady Ground (Eb), down a major third: worth a look. */
const TRICKY_CHANGE: Target = {
  selector: '[data-level="worth-a-look"]',
  closest: "button",
};
const KEY_CHANGE_PANEL = css('dialog[aria-label="Key change"]');
const STEADY_GROUND_ROW: Target = {
  selector: '[aria-label="Open Steady Ground"]',
  closest: "li",
};
/** Steady Ground's row with its key panel open under it, framed as one. */
const ROW_AND_PANEL: Target = { ...STEADY_GROUND_ROW, with: KEY_CHANGE_PANEL };
const PLAY_IN_KEY: Target = { selector: `.${styles.alternates} button` };
const STEADY_GROUND_IN_D = css(
  '[aria-label="Key D, change key for Steady Ground"]'
);
/** The worship set from its header down to the new song, the details pane out of shot. */
const WORSHIP_SET: Target = {
  selector: '[aria-label="Open Worship"]',
  closest: "li",
  with: { selector: '[aria-label="Open Lantern Hill"]', closest: "li" },
};
/** Where the cursor picks Song: right of the new row's key chip once the menu closes. */
const SONG_CLICK = { x: 0.6, y: 0.5 } as const;

/**
 * How each window frames the plan. The 4:5 and 16:9 windows are wider than the set, so
 * the insert line and the details are framed off-centre, with the grips and lengths in
 * frame; at phone width the camera only pans.
 */
const PLAN_FRAMING = {
  feed: {
    insert: { zoom: 1.7, offset: { x: -97 } },
    details: { zoom: 1.36, offset: { x: -219, y: 186 } },
    set: 2.1,
  },
  landscape: {
    insert: { zoom: 1.6, offset: { x: -131, y: 22 } },
    details: { zoom: 1.26, offset: { x: -352, y: 85 } },
    set: 1.72,
  },
  portrait: { insert: {}, details: {}, set: undefined },
} as const;

/**
 * Setting the plan, in one continuous shot of the run sheet: hover the line after Open
 * Doors and add a song, read how its key fits in the details beside it, then follow the
 * key changes down the set, open the tricky one, and play Steady Ground in D so it flows.
 * Menus and panels simply open; only the details pane, which reflows the sheet, softens.
 */
export const PlanScene = ({ duration }: { duration: number }) => {
  const hoverAt = 16;
  const menuAt = 30;
  const songAt = 50;
  const keysAt = 112;
  const trickyAt = 152;
  const pickAt = 236;
  // The details pane is component state, so every later beat opens it again. At phone
  // width it is a sheet over the run sheet, so it closes before the key changes, and the
  // hover-only insert line doesn't exist, so the song simply arrives.
  const format = useFormat();
  const portrait = format === "portrait";
  const framing = PLAN_FRAMING[format];
  const detailsDuringKeys = portrait ? NO_CLICKS : KEEP_DETAILS;
  return (
    <FeatureScene
      carry
      handOff
      transition="cut"
      duration={duration}
      captions={[
        { at: 0, lines: ["Build the set."] },
        { at: songAt + 4, lines: ["Add a song.", "*See how its key fits.*"] },
        {
          at: keysAt,
          lines: ["Follow every key change", "*down the set.*"],
        },
        {
          at: trickyAt + 6,
          lines: ["A tricky one?", "*Get ways to connect.*"],
        },
        { at: pickAt + 6, lines: ["One click,", "*and it flows.*"] },
      ]}
      beats={[
        {
          at: 0,
          apply: () => {
            showView("plan")();
            addHayden();
          },
        },
        { at: hoverAt, focus: [ADD_AFTER_OPEN_DOORS] },
        { at: menuAt + 3, clicks: [ADD_AFTER_OPEN_DOORS] },
        { at: songAt + 3, apply: addLanternHill, clicks: KEEP_DETAILS },
        { at: keysAt - 6, clicks: detailsDuringKeys },
        { at: trickyAt + 3, clicks: [...detailsDuringKeys, TRICKY_CHANGE] },
        { at: pickAt + 3, apply: steadyGroundInD, clicks: detailsDuringKeys },
      ]}
      shots={[
        { at: 0, target: OPEN_DOORS_ROW, ...framing.insert, duration: 1 },
        {
          at: songAt + 4,
          // The new row and its details side by side, from the lengths to the pane.
          target: DETAILS,
          ...framing.details,
          beat: 3,
          duration: 24,
        },
        {
          at: keysAt - 6,
          target: WORSHIP_SET,
          zoom: framing.set,
          beat: 4,
          duration: 26,
        },
        {
          at: trickyAt + 4,
          target: ROW_AND_PANEL,
          pad: 14,
          beat: 5,
          duration: 22,
        },
        {
          // Back on the set, now flowing from G into D.
          at: pickAt + 2,
          target: WORSHIP_SET,
          zoom: framing.set,
          beat: 6,
          duration: 18,
        },
      ]}
      cursor={[
        ...(portrait
          ? []
          : [
              { at: hoverAt, target: INSERT_PLUS, travel: 14 },
              {
                at: menuAt,
                target: INSERT_PLUS,
                click: true,
                travel: 6,
                beat: 1,
              },
              {
                at: songAt,
                target: SONG_CHOICE,
                click: true,
                travel: 14,
                anchor: SONG_CLICK,
                beat: 2,
              },
            ]),
        {
          at: trickyAt,
          target: TRICKY_CHANGE,
          click: true,
          travel: 16,
          beat: 4,
        },
        { at: pickAt, target: PLAY_IN_KEY, click: true, travel: 22, beat: 5 },
      ]}
      swaps={portrait ? [songAt + 3, keysAt - 6] : [songAt + 3]}
    >
      <ProductDemo />
    </FeatureScene>
  );
};

/**
 * Key transitions on their own, for short cuts: the run sheet flags a tricky change, the
 * panel says how to connect the songs, and one click on a better key makes it flow.
 */
export const KeyTransitionScene = ({ duration }: { duration: number }) => {
  const openAt = 30;
  const pickAt = 104;
  return (
    <FeatureScene
      duration={duration}
      captions={[
        { at: 0, lines: ["See how each song", "*lands in the next key.*"] },
        {
          at: openAt + 6,
          lines: ["A tricky change?", "*Get ways to connect.*"],
        },
        { at: pickAt + 6, lines: ["One click,", "*and it flows.*"] },
      ]}
      beats={[
        { at: 0, apply: showView("plan") },
        { at: openAt + 3, clicks: [TRICKY_CHANGE] },
        { at: pickAt + 3, apply: steadyGroundInD },
      ]}
      cursor={[
        { at: openAt, target: TRICKY_CHANGE, click: true, travel: 18 },
        { at: pickAt, target: PLAY_IN_KEY, click: true, travel: 22, beat: 1 },
      ]}
      shots={[
        { at: 0, target: TRICKY_CHANGE, zoom: 1.8, duration: 1 },
        {
          at: openAt + 4,
          target: ROW_AND_PANEL,
          pad: 14,
          portraitZoom: 1.45,
          beat: 1,
          duration: 22,
        },
        {
          at: pickAt + 2,
          target: STEADY_GROUND_ROW,
          zoom: 1.9,
          beat: 2,
          duration: 18,
        },
      ]}
      highlights={[
        { from: 6, to: openAt - 2, target: TRICKY_CHANGE },
        { from: openAt + 40, to: pickAt - 2, target: PLAY_IN_KEY, beat: 1 },
        { from: pickAt + 14, to: duration, target: STEADY_GROUND_IN_D },
      ]}
    >
      <ProductDemo />
    </FeatureScene>
  );
};

// People
const section = (title: string): Target => ({
  selector: "h3",
  text: title,
  closest: "section",
});
/**
 * The People page's three attention cards truncate names at the feed's 1000px canvas;
 * laid out at this width the names and the due list's "Last served 8 weeks ago" read in
 * full. Phone layouts stack the cards and ignore it.
 */
const PEOPLE_CANVAS_WIDTH = 1320;
/** Team health: the verdict, its four numbers, and how the serving is spread. */
const HEALTH_CARD = css(`.${styles["health-card"]}`);
const WAITING = section("Waiting on a reply");
const CHECK_IN = section("Check in");
const DUE = section("Due for a slot");
/**
 * Where each attention card sits in its frame, in native pixels from its centre. The feed
 * frames it under the whole health card, whose numbers back it up; landscape's shorter
 * window puts it at the top with the gap above it, so no row of the health card is cut.
 * Portrait stacks the cards and only pans.
 */
const CARD_OFFSET_Y = { feed: -62, landscape: 26, portrait: 0 } as const;
/**
 * The due card ends at the page's right edge, where the pan clamp holds the camera: pull
 * back past the clamp far enough to keep the window's scroll gutter out of frame.
 */
const DUE_OFFSET_X = { feed: -96, landscape: -90, portrait: 0 } as const;
/** Landscape's reply list sits by the sidebar: keep its cut-off footer links out of frame. */
const WAITING_OFFSET_X = { feed: 0, landscape: 16, portrait: 0 } as const;
/** At the foot of portrait's stack, just enough zoom to drop the health card's last row. */
const LOWER_PORTRAIT_ZOOM = 1.03;

/**
 * The people behind the plan: how the teams are doing, who hasn't answered, who is
 * carrying too much or pulling back, and who is ready for another slot. Every caption
 * lands on a beat, just after the camera starts toward its card.
 */
export const PeopleScene = ({ duration }: { duration: number }) => {
  const format = useFormat();
  const waitingAt = 60;
  const checkInAt = 120;
  const dueAt = 200;
  const lead = 4;
  const offset = { y: CARD_OFFSET_Y[format] };
  return (
    <FeatureScene
      canvasWidth={PEOPLE_CANVAS_WIDTH}
      carry
      transition="soft-out"
      duration={duration}
      captions={[
        { at: 0, lines: ["Look after your people.", "*Not just the plan.*"] },
        {
          at: waitingAt,
          lines: ["See who still", "*needs to answer.*"],
        },
        {
          at: checkInAt,
          // Portrait's narrower headline would wrap the first line and orphan "much,".
          lines:
            format === "portrait"
              ? ["Notice who’s", "carrying too much,", "*or drifting away.*"]
              : ["Notice who’s carrying too much,", "*or drifting away.*"],
        },
        {
          at: dueAt,
          lines: ["And who’s ready", "*for another Sunday.*"],
        },
      ]}
      beats={[{ at: 0, apply: showView("people") }]}
      shots={[
        { at: 0, target: HEALTH_CARD, pad: 16, duration: 1 },
        {
          at: waitingAt - lead,
          // Portrait's window already shows the reply list under the health card; it
          // holds there, and pans once, to the check-in and due lists below.
          target: format === "portrait" ? HEALTH_CARD : WAITING,
          offset: { ...offset, x: WAITING_OFFSET_X[format] },
          duration: 26,
        },
        {
          at: checkInAt - lead,
          target: CHECK_IN,
          offset,
          portraitZoom: LOWER_PORTRAIT_ZOOM,
          duration: 26,
        },
        {
          at: dueAt - lead,
          target: DUE,
          offset: { ...offset, x: DUE_OFFSET_X[format] },
          portraitZoom: LOWER_PORTRAIT_ZOOM,
          duration: 26,
        },
      ]}
    >
      {/* The phone layout scrolls inside its window, out of the camera's reach; the
          stacked cards on their own let it pan down to each. */}
      {format === "portrait" ? <PeopleShowcase /> : <ProductDemo />}
    </FeatureScene>
  );
};
