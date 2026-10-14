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
const SONG_CHOICE: Target = { selector: '[role="menuitem"]', text: "Song" };
const OPEN_LANTERN_HILL = css('[aria-label="Open Lantern Hill"]');
const LANTERN_HILL_ROW: Target = {
  selector: '[aria-label="Open Lantern Hill"]',
  closest: "li",
};
const WORSHIP_SET: Target = {
  selector: '[aria-label="Open Steady Ground"]',
  closest: "li",
};

/** Building the set: a song added after Open Doors, its details beside the run sheet. */
export const BuildSetScene = ({ duration }: { duration: number }) => {
  const menuAt = 34;
  const addAt = 64;
  return (
    <FeatureScene
      handOff
      carry
      transition="cut"
      duration={duration}
      captions={[
        { at: 0, lines: ["Build the set."] },
        {
          at: addAt + 6,
          lines: ["Add a song.", "*See how its key fits.*"],
        },
      ]}
      beats={[
        {
          at: 0,
          apply: () => {
            showView("plan")();
            addHayden();
          },
        },
        { at: menuAt + 3, clicks: [ADD_AFTER_OPEN_DOORS] },
        { at: addAt + 3, apply: addLanternHill, clicks: [OPEN_LANTERN_HILL] },
      ]}
      shots={[
        { at: 0, target: WORSHIP_SET, zoom: 1.6, duration: 1 },
        {
          at: addAt + 6,
          target: LANTERN_HILL_ROW,
          zoom: 1.5,
          beat: 2,
          duration: 24,
        },
      ]}
      cursor={[
        { at: menuAt, target: ADD_AFTER_OPEN_DOORS, click: true, travel: 18 },
        { at: addAt, target: SONG_CHOICE, click: true, travel: 16, beat: 1 },
      ]}
      highlights={[
        { from: addAt + 20, to: duration, target: LANTERN_HILL_ROW },
      ]}
      swaps={[menuAt + 3, addAt + 3]}
    >
      <ProductDemo />
    </FeatureScene>
  );
};

/** Morning Light (G) into Steady Ground (Eb), down a major third: worth a look. */
const TRICKY_CHANGE: Target = {
  selector: '[data-level="worth-a-look"]',
  closest: "button",
};
const KEY_CHANGE_PANEL = css('dialog[aria-label="Key change"]');
const PLAY_IN_KEY: Target = { selector: `.${styles.alternates} button` };
const STEADY_GROUND_IN_D = css(
  '[aria-label="Key D, change key for Steady Ground"]'
);

/**
 * Key transitions: the run sheet flags a tricky change between two songs, the panel says
 * why and how to connect them, and one click on a better key makes it flow.
 */
export const KeyTransitionScene = ({
  duration,
  carry = true,
}: {
  duration: number;
  /** Off when it opens a cut on its own, after a scene that fades out. */
  carry?: boolean;
}) => {
  const openAt = 34;
  const pickAt = 112;
  return (
    <FeatureScene
      handOff={carry}
      carry={carry}
      transition={carry ? "cut" : "soft"}
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
        {
          at: 0,
          apply: () => {
            showView("plan")();
            addHayden();
            addLanternHill();
          },
        },
        { at: openAt + 3, clicks: [TRICKY_CHANGE] },
        { at: pickAt + 3, apply: steadyGroundInD },
      ]}
      cursor={[
        { at: openAt, target: TRICKY_CHANGE, click: true, travel: 18 },
        { at: pickAt, target: PLAY_IN_KEY, click: true, travel: 24, beat: 1 },
      ]}
      shots={[
        { at: 0, target: TRICKY_CHANGE, zoom: 1.8, duration: 1 },
        {
          at: openAt + 4,
          target: KEY_CHANGE_PANEL,
          pad: 18,
          portraitZoom: 1.45,
          beat: 1,
          duration: 22,
        },
        {
          at: pickAt + 4,
          target: STEADY_GROUND_IN_D,
          zoom: 1.8,
          beat: 2,
          duration: 22,
        },
      ]}
      highlights={[
        { from: 6, to: openAt - 2, target: TRICKY_CHANGE },
        { from: openAt + 50, to: pickAt - 2, target: PLAY_IN_KEY, beat: 1 },
        { from: pickAt + 14, to: duration, target: STEADY_GROUND_IN_D },
      ]}
      swaps={[openAt + 3, pickAt + 3]}
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
