import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Series,
  interpolate,
  staticFile,
} from "remotion";

import { Backdrop } from "./components/backdrop";
import type { Lines } from "./components/headline";
import { FPS } from "./lib/format";
import {
  BrandScene,
  EndCard,
  HookScene,
  HowItWorksScene,
  SavesBackScene,
  ServicesScene,
} from "./scenes/brand-scenes";
import type { Change } from "./scenes/brand-scenes";
import {
  ChordChartScene,
  FillTeamsScene,
  HistoryScene,
  ImportScene,
  OverviewScene,
  RunSheetScene,
  TeamHealthScene,
} from "./scenes/product-scenes";
import {
  FillSundayScene,
  KeyTransitionScene,
  PeopleScene,
  PlanScene,
} from "./scenes/story-scenes";

interface CutScene {
  readonly name: string;
  readonly duration: number;
  readonly render: (duration: number) => ReactNode;
}

const HOOK: Lines = {
  landscape: ["Still filling Sunday’s team", "*on Thursday night?*"],
  portrait: ["Still filling", "Sunday’s team", "*on Thursday night?*"],
};

const scene = (
  name: string,
  duration: number,
  render: (duration: number) => ReactNode
): CutScene => ({ name, duration, render });

/**
 * The feed cuts' music bed: "Busted Jazz" from Holizna's Lo-Fi and Chill, released CC0 on
 * the Free Music Archive (https://freemusicarchive.org/music/holiznacc0/lo-fi-and-chill).
 * It runs at 90 BPM, a beat every 20 frames. The file in public/music starts 53.97s into
 * the track, on the downbeat where its fuller section comes in, so the cut opens at full
 * energy; every scene lasts whole beats, so each cut lands on one. Loudness-normalized to
 * -14 LUFS.
 */
const MUSIC = {
  src: "music/busted-jazz.mp3",
  firstBeatSeconds: 0,
  volume: 0.8,
  fadeOutFrames: 45,
} as const;

const FRAMES_PER_BEAT = 20;
const beats = (count: number): number => count * FRAMES_PER_BEAT;

/** What the demo changed, as it saves back to Planning Center. */
const DEMO_CHANGES: readonly Change[] = [
  {
    badge: "HC",
    title: "Hayden Collins",
    detail: "Acoustic Guitar, requested",
  },
  { badge: null, title: "Lantern Hill", detail: "Added after Open Doors" },
  { badge: null, title: "Steady Ground", detail: "Key changed to D" },
];

/** 15 seconds: the problem, one spot filled and saved, a key smoothed out, the ask. */
const TEASER: readonly CutScene[] = [
  scene("Hook", beats(4), (duration) => (
    <HookScene duration={duration} lines={HOOK} />
  )),
  scene("Fill a team", beats(7), (duration) => (
    <FillTeamsScene
      duration={duration}
      fromLineup={false}
      lines={["Fill every team", "*with the right people.*"]}
    />
  )),
  scene("Key transitions", beats(7), (duration) => (
    <KeyTransitionScene duration={duration} />
  )),
  scene("End card", beats(5), (duration) => <EndCard duration={duration} />),
];

/**
 * About 50 seconds: planning one Sunday. Start from what's open, fill a spot with the
 * history behind the choice, build the set, smooth its keys, look after the people, and
 * see it all saved back. The opening takes its time while the music swells in.
 */
const DEMO: readonly CutScene[] = [
  scene("Hook", beats(6), (duration) => (
    <HookScene duration={duration} lines={HOOK} />
  )),
  scene("PCOBooster", beats(6), (duration) => (
    <BrandScene duration={duration} />
  )),
  scene("Fill a spot", beats(26), (duration) => (
    <FillSundayScene duration={duration} />
  )),
  scene("Set the plan", beats(15), (duration) => (
    <PlanScene duration={duration} />
  )),
  scene("People", beats(14), (duration) => <PeopleScene duration={duration} />),
  scene("Saves back", beats(5), (duration) => (
    <SavesBackScene duration={duration} changes={DEMO_CHANGES} />
  )),
  scene("End card", beats(7), (duration) => <EndCard duration={duration} />),
];

/** About 70 seconds: the walkthrough, room for a voiceover over each beat. */
const WALKTHROUGH: readonly CutScene[] = [
  scene("Hook", 90, (duration) => (
    <HookScene duration={duration} lines={HOOK} />
  )),
  scene("Planning Center Services", 84, (duration) => (
    <ServicesScene duration={duration} />
  )),
  scene("PCOBooster", 105, (duration) => <BrandScene duration={duration} />),
  scene("How it works", 180, (duration) => (
    <HowItWorksScene duration={duration} />
  )),
  scene("Overview", 135, (duration) => <OverviewScene duration={duration} />),
  scene("Fill a team", 195, (duration) => (
    <FillTeamsScene duration={duration} />
  )),
  scene("History", 150, (duration) => <HistoryScene duration={duration} />),
  scene("Team health", 165, (duration) => (
    <TeamHealthScene duration={duration} />
  )),
  scene("Run sheet and times", 195, (duration) => (
    <RunSheetScene duration={duration} />
  )),
  scene("Chord charts", 165, (duration) => (
    <ChordChartScene duration={duration} />
  )),
  scene("Import", 140, (duration) => <ImportScene duration={duration} />),
  scene("Saves back", 135, (duration) => (
    <SavesBackScene duration={duration} />
  )),
  scene("End card", 165, (duration) => <EndCard duration={duration} />),
];

export const CUT_IDS = ["Teaser15", "Demo50", "Walkthrough70"] as const;
export type CutId = (typeof CUT_IDS)[number];

/** The walkthrough's brand scenes are laid out for 16:9 and 9:16 only. */
export const FEED_CUT_IDS = [
  "Teaser15",
  "Demo50",
] as const satisfies readonly CutId[];

export const CUTS = {
  Teaser15: TEASER,
  Demo50: DEMO,
  Walkthrough70: WALKTHROUGH,
} as const satisfies Record<CutId, readonly CutScene[]>;

export const cutDuration = (cut: CutId): number =>
  CUTS[cut].reduce((total, entry) => total + entry.duration, 0);

/** The bed under a feed cut, faded out over its last second. */
const Music = ({ duration }: { duration: number }) => (
  <Html5Audio
    src={staticFile(MUSIC.src)}
    trimBefore={Math.round(MUSIC.firstBeatSeconds * FPS)}
    volume={(frame) =>
      MUSIC.volume *
      interpolate(frame, [duration - MUSIC.fadeOutFrames, duration], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    }
  />
);

const SCORED: ReadonlySet<CutId> = new Set(FEED_CUT_IDS);

export const Cut = ({ cut }: { cut: CutId }) => (
  <AbsoluteFill>
    <Backdrop />
    {SCORED.has(cut) ? <Music duration={cutDuration(cut)} /> : null}
    <Series>
      {CUTS[cut].map((entry) => (
        <Series.Sequence
          key={entry.name}
          name={entry.name}
          durationInFrames={entry.duration}
        >
          {entry.render(entry.duration)}
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);
