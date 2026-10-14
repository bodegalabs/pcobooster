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
import {
  ChordChartScene,
  FillJobScene,
  FillTeamsScene,
  HistoryScene,
  ImportScene,
  OverviewScene,
  QuickHealthScene,
  QuickKeyScene,
  QuickTransposeScene,
  RunSheetScene,
  TeamHealthScene,
} from "./scenes/product-scenes";

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
 * The feed cuts' music bed: "Inspiration" by Pro Sensory, released CC0 on OpenGameArt
 * (https://opengameart.org/content/inspiration-1). Measured at 100.6 BPM with its first
 * beat 0.337s in; the cut starts the track there so frame 0 is a downbeat.
 */
const MUSIC = {
  src: "music/inspiration.mp3",
  bpm: 100.6,
  firstBeatSeconds: 0.337,
  volume: 0.62,
  fadeOutFrames: 30,
} as const;

const FRAMES_PER_BEAT = (FPS * 60) / MUSIC.bpm;

/**
 * Scenes measured in beats. Each scene ends on the frame nearest its beat, counted from
 * the start of the cut, so rounding never drifts the cuts off the music.
 */
const onBeats = (
  entries: readonly (readonly [
    name: string,
    beats: number,
    render: (duration: number) => ReactNode,
  ])[]
): readonly CutScene[] => {
  let beat = 0;
  let frame = 0;
  return entries.map(([name, beats, render]) => {
    beat += beats;
    const end = Math.round(beat * FRAMES_PER_BEAT);
    const entry = scene(name, end - frame, render);
    frame = end;
    return entry;
  });
};

/*
 * The feed cuts follow launch-video practice: a first frame that reads as the thumbnail,
 * one job carried all the way to its payoff, hard cuts on the beat, and a short ask.
 */

/** 15 seconds: the problem, one spot filled and saved, the ask. */
const TEASER = onBeats([
  [
    "Hook",
    4,
    (duration) => (
      <HookScene duration={duration} lines={HOOK} instant transition="cut" />
    ),
  ],
  [
    "Fill a spot",
    13,
    (duration) => <FillJobScene duration={duration} pace="quick" />,
  ],
  [
    "End card",
    8,
    (duration) => <EndCard duration={duration} transition="cut" />,
  ],
]);

/** About 27 seconds: the problem, one spot filled and saved, three quick wins, the ask. */
const LAUNCH = onBeats([
  [
    "Hook",
    4,
    (duration) => (
      <HookScene duration={duration} lines={HOOK} instant transition="cut" />
    ),
  ],
  ["Fill a spot", 18, (duration) => <FillJobScene duration={duration} />],
  ["Team health", 5, (duration) => <QuickHealthScene duration={duration} />],
  ["Keys", 5, (duration) => <QuickKeyScene duration={duration} />],
  ["Transpose", 5, (duration) => <QuickTransposeScene duration={duration} />],
  [
    "End card",
    8,
    (duration) => <EndCard duration={duration} transition="cut" />,
  ],
]);

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

export const CUT_IDS = ["Teaser15", "Launch30", "Walkthrough70"] as const;
export type CutId = (typeof CUT_IDS)[number];

/** The walkthrough's brand scenes are laid out for 16:9 and 9:16 only. */
export const FEED_CUT_IDS = [
  "Teaser15",
  "Launch30",
] as const satisfies readonly CutId[];

export const CUTS = {
  Teaser15: TEASER,
  Launch30: LAUNCH,
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
