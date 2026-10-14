import {
  addAssignment,
  navigateDemo,
} from "../../../marketing/src/components/product-demo/demo-model";
import type { PlanView } from "../../../marketing/src/components/product-demo/demo-model";
import {
  insertPlanItem,
  updatePlanItem,
} from "../../../marketing/src/components/product-demo/plan-model";
import { ProductDemo } from "../../../marketing/src/components/product-demo/product-demo";
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

const showView = (view: PlanView | "people") => () => {
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

// Overview
const PEOPLE_CARD: Target = {
  selector: "button",
  text: "Acoustic Guitar · Band",
  closest: "section",
};
const ACOUSTIC_NEEDED: Target = {
  selector: "button",
  text: "Acoustic Guitar · Band",
};

// Assign
const FRANKIE_ROW: Target = {
  selector: '[aria-label="Confirmed. Change status for Frankie Turner"]',
  closest: "li",
};
/** Frankie's Thursday rehearsal, then the Sunday after it. */
const FRANKIE_REHEARSAL = css(
  '[aria-label="Thu, Sep 24: Band - Acoustic Guitar (rehearsal)"]'
);
const FRANKIE_SUNDAY = css(
  '[aria-label="Sun, Sep 27: Band - Acoustic Guitar"]'
);
const HAYDEN_ROW: Target = {
  selector: '[aria-label="Add Hayden Collins to this position"]',
  closest: "li",
};
const ADD_HAYDEN = css('[aria-label="Add Hayden Collins to this position"]');
const HAYDEN_SCHEDULED: Target = {
  selector: '[aria-label="Pending. Change status for Hayden Collins"]',
  closest: "li",
};

/**
 * Filling a spot, start to finish: the Sunday's overview shows what's open, the open
 * Acoustic Guitar spot leads to everyone who could play, Frankie's last month of
 * services and rehearsals shows why to ask someone else, and Hayden, the most rested,
 * is asked and saved.
 */
export const FillSundayScene = ({ duration }: { duration: number }) => {
  // The overview holds a few seconds before the click, so the opening can breathe.
  const assignAt = 104;
  const rehearsalAt = 188;
  const sundayAt = 240;
  const rankedAt = 294;
  const addAt = 374;
  const beats: Beat[] = [
    { at: 0, apply: showView("overview") },
    { at: assignAt + 3, apply: showView("assign") },
    { at: rehearsalAt + 3, focus: [FRANKIE_REHEARSAL] },
    { at: sundayAt + 3, focus: [FRANKIE_SUNDAY] },
    { at: rankedAt },
    { at: addAt + 3, apply: addHayden },
  ];
  return (
    <FeatureScene
      handOff
      transition="soft-in"
      duration={duration}
      captions={[
        { at: 0, lines: ["Start with Sunday.", "*See what’s still open.*"] },
        {
          at: assignAt + 8,
          lines: ["Everyone who could play,", "*with their month around it.*"],
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
        { at: 0, target: PEOPLE_CARD, zoom: 1.7, duration: 1 },
        { at: 50, target: ACOUSTIC_NEEDED, zoom: 2, duration: 36 },
        {
          at: assignAt + 6,
          target: FRANKIE_ROW,
          zoom: 1.6,
          beat: 1,
          duration: 26,
        },
        {
          at: rehearsalAt - 24,
          target: FRANKIE_ROW,
          zoom: 2.1,
          beat: 2,
          duration: 26,
        },
        {
          at: rankedAt - 10,
          target: HAYDEN_ROW,
          zoom: 2,
          beat: 4,
          duration: 30,
        },
        {
          at: addAt + 8,
          target: HAYDEN_SCHEDULED,
          zoom: 1.9,
          beat: 5,
          duration: 22,
        },
        {
          at: addAt + 32,
          target: HAYDEN_SCHEDULED,
          zoom: 2.1,
          beat: 5,
          duration: 100,
        },
      ]}
      cursor={[
        { at: assignAt, target: ACOUSTIC_NEEDED, click: true, travel: 22 },
        {
          at: rehearsalAt,
          target: FRANKIE_REHEARSAL,
          travel: 24,
          beat: 1,
        },
        { at: sundayAt, target: FRANKIE_SUNDAY, travel: 18, beat: 2 },
        { at: addAt, target: ADD_HAYDEN, click: true, travel: 30, beat: 4 },
      ]}
      highlights={[
        { from: 14, to: assignAt - 4, target: ACOUSTIC_NEEDED },
        { from: rankedAt + 10, to: addAt - 4, target: HAYDEN_ROW },
        { from: addAt + 18, to: duration, target: HAYDEN_SCHEDULED },
      ]}
      revealAt={assignAt + 6}
      swaps={[assignAt + 3, addAt + 3]}
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
const KEY_HINT = css(`.${styles["pane-hint"]}`);
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
  const portrait = useFormat() === "portrait";
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
        { at: trickyAt + 3, clicks: [...detailsDuringKeys, TRICKY_CHANGE] },
        { at: pickAt + 3, apply: steadyGroundInD, clicks: detailsDuringKeys },
      ]}
      shots={[
        { at: 0, target: OPEN_DOORS_ROW, zoom: 1.7, duration: 1 },
        {
          at: songAt + 4,
          // The details sit at the window's right edge; this zoom keeps the new row's
          // title in frame on the left.
          target: DETAILS,
          zoom: 1.45,
          beat: 3,
          duration: 24,
        },
        {
          at: keysAt - 6,
          target: TRICKY_CHANGE,
          zoom: 1.9,
          beat: 3,
          duration: 26,
        },
        {
          at: trickyAt + 4,
          target: ROW_AND_PANEL,
          pad: 14,
          beat: 4,
          duration: 22,
        },
        {
          at: pickAt + 2,
          target: STEADY_GROUND_ROW,
          zoom: 1.9,
          beat: 5,
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
                beat: 2,
              },
            ]),
        {
          at: trickyAt,
          target: TRICKY_CHANGE,
          click: true,
          travel: 22,
          beat: 3,
        },
        { at: pickAt, target: PLAY_IN_KEY, click: true, travel: 22, beat: 4 },
      ]}
      highlights={[
        { from: songAt + 18, to: keysAt - 8, target: KEY_HINT },
        { from: keysAt + 12, to: trickyAt - 2, target: TRICKY_CHANGE },
        { from: pickAt - 34, to: pickAt - 2, target: PLAY_IN_KEY, beat: 4 },
        { from: pickAt + 14, to: duration, target: STEADY_GROUND_IN_D },
      ]}
      swaps={portrait ? [songAt + 3, trickyAt + 3] : [songAt + 3]}
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
const TEAMS_YOU_LEAD = css(`.${styles["health-card"]}`);
const WAITING = section("Waiting on a reply");
const CHECK_IN = section("Check in");
const DUE = section("Due for a slot");
const HEAVY_LOAD: Target = { selector: "span", text: "Heavy load" };
const DECLINING: Target = { selector: "span", text: "Declining" };

/**
 * The people behind the plan: how the teams are doing, who hasn't answered, who is
 * carrying too much or drifting, and who is ready for another slot.
 */
export const PeopleScene = ({ duration }: { duration: number }) => {
  const waitingAt = 66;
  const checkInAt = 128;
  const dueAt = 212;
  return (
    <FeatureScene
      carry
      transition="soft-out"
      duration={duration}
      captions={[
        { at: 0, lines: ["Look after your people.", "*Not just the plan.*"] },
        {
          at: waitingAt + 6,
          lines: ["See who still", "*needs to answer.*"],
        },
        {
          at: checkInAt + 6,
          lines: ["Notice who’s carrying too much,", "*or drifting away.*"],
        },
        {
          at: dueAt + 6,
          lines: ["And who’s ready", "*for another Sunday.*"],
        },
      ]}
      beats={[{ at: 0, apply: showView("people") }]}
      shots={[
        { at: 0, target: TEAMS_YOU_LEAD, zoom: 1.25, duration: 1 },
        { at: waitingAt, target: WAITING, pad: 12, duration: 26 },
        { at: checkInAt, target: CHECK_IN, pad: 12, duration: 26 },
        { at: dueAt, target: DUE, pad: 12, duration: 26 },
      ]}
      highlights={[
        { from: checkInAt + 30, to: dueAt - 4, target: HEAVY_LOAD },
        { from: checkInAt + 42, to: dueAt - 4, target: DECLINING },
      ]}
    >
      <ProductDemo />
    </FeatureScene>
  );
};
