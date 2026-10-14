import type { ReactNode } from "react";
import { AbsoluteFill, Series } from "remotion";

import { Backdrop } from "./components/backdrop";
import type { Lines } from "./components/headline";
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

/*
 * The feed cuts follow launch-video practice: a first frame that reads as the thumbnail,
 * one job carried all the way to its payoff, hard cuts, and a short ask at the end.
 */

/** 15 seconds: the problem, one spot filled and saved, the ask. */
const TEASER: readonly CutScene[] = [
  scene("Hook", 60, (duration) => (
    <HookScene duration={duration} lines={HOOK} instant transition="cut" />
  )),
  scene("Fill a spot", 246, (duration) => (
    <FillJobScene duration={duration} pace="quick" />
  )),
  scene("End card", 144, (duration) => (
    <EndCard duration={duration} transition="cut" />
  )),
];

/** 30 seconds: the problem, one spot filled and saved, three quick wins, the ask. */
const LAUNCH: readonly CutScene[] = [
  scene("Hook", 66, (duration) => (
    <HookScene duration={duration} lines={HOOK} instant transition="cut" />
  )),
  scene("Fill a spot", 318, (duration) => <FillJobScene duration={duration} />),
  scene("Team health", 84, (duration) => (
    <QuickHealthScene duration={duration} />
  )),
  scene("Keys", 84, (duration) => <QuickKeyScene duration={duration} />),
  scene("Transpose", 84, (duration) => (
    <QuickTransposeScene duration={duration} />
  )),
  scene("End card", 150, (duration) => (
    <EndCard duration={duration} transition="cut" />
  )),
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

export const Cut = ({ cut }: { cut: CutId }) => (
  <AbsoluteFill>
    <Backdrop />
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
