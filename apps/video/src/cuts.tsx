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
  FillTeamsScene,
  HistoryScene,
  ImportScene,
  KeyTransitionScene,
  OverviewScene,
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
 * The feed cuts: the walkthrough's scenes, trimmed to the beat of the music bed, with the
 * brand in one short beat so the product shows within five seconds.
 */

/** 15 seconds: the problem, one fill, one transpose, the ask. */
const TEASER = onBeats([
  ["Hook", 4, (duration) => <HookScene duration={duration} lines={HOOK} />],
  [
    "Fill a team",
    7,
    (duration) => (
      <FillTeamsScene
        duration={duration}
        fromLineup={false}
        lines={["Fill every team", "*with the right people.*"]}
      />
    ),
  ],
  ["Chord charts", 7, (duration) => <ChordChartScene duration={duration} />],
  ["End card", 8, (duration) => <EndCard duration={duration} />],
]);

/** About 30 seconds: one beat per job of the planning week, then the ask. */
const LAUNCH = onBeats([
  ["Hook", 4, (duration) => <HookScene duration={duration} lines={HOOK} />],
  [
    "PCOBooster",
    5,
    (duration) => <BrandScene duration={duration} subline={false} />,
  ],
  ["Fill a team", 9, (duration) => <FillTeamsScene duration={duration} />],
  [
    "Key transitions",
    8,
    (duration) => <KeyTransitionScene duration={duration} />,
  ],
  ["Team health", 6, (duration) => <TeamHealthScene duration={duration} />],
  ["Chord charts", 7, (duration) => <ChordChartScene duration={duration} />],
  ["Saves back", 5, (duration) => <SavesBackScene duration={duration} />],
  ["End card", 6, (duration) => <EndCard duration={duration} />],
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
