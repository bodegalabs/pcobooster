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
  FillTeamsScene,
  HistoryScene,
  ImportScene,
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

/** 15 seconds: the problem, one fill, one transpose, the name. */
const TEASER: readonly CutScene[] = [
  scene("Hook", 66, (duration) => (
    <HookScene duration={duration} lines={HOOK} />
  )),
  scene("Fill a team", 120, (duration) => (
    <FillTeamsScene
      duration={duration}
      fromLineup={false}
      lines={["Fill every team", "*with the right people.*"]}
    />
  )),
  scene("Chord charts", 120, (duration) => (
    <ChordChartScene duration={duration} />
  )),
  scene("End card", 144, (duration) => <EndCard duration={duration} />),
];

/** 30 seconds: the launch hero, one beat per job of the planning week. */
const LAUNCH: readonly CutScene[] = [
  scene("Hook", 75, (duration) => (
    <HookScene duration={duration} lines={HOOK} />
  )),
  scene("Planning Center Services", 60, (duration) => (
    <ServicesScene duration={duration} />
  )),
  scene("PCOBooster", 78, (duration) => <BrandScene duration={duration} />),
  scene("Fill a team", 150, (duration) => (
    <FillTeamsScene duration={duration} />
  )),
  scene("Team health", 120, (duration) => (
    <TeamHealthScene duration={duration} />
  )),
  scene("Run sheet", 111, (duration) => (
    <RunSheetScene duration={duration} withTimes={false} />
  )),
  scene("Chord charts", 120, (duration) => (
    <ChordChartScene duration={duration} />
  )),
  scene("Saves back", 78, (duration) => <SavesBackScene duration={duration} />),
  scene("End card", 108, (duration) => <EndCard duration={duration} />),
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
