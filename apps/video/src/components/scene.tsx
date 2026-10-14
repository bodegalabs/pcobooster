import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Html5Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import { mix, progress } from "../lib/motion";

const ENTER_FRAMES = 10;
const EXIT_FRAMES = 9;
const PUSH_IN_FRAMES = 9;
const PUSH_OUT_FRAMES = 6;
const PUSH_DISTANCE = 220;
const PUSH_BLUR = 14;
const SWISH_VOLUME = 0.22;
const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

/**
 * How a scene meets its neighbours: `soft` focuses in at its start and blurs out at its
 * end; `cut` is a hard cut; `push` slides out to the left and in from the right with a
 * swish, like swiping to the next card; `push-in` arrives that way and stays (an end card). None overlaps the next scene, which would mount
 * two replicas that both drive the replica's shared stores.
 */
export type Transition = "soft" | "cut" | "push" | "push-in";

const softStyle = (duration: number, frame: number): CSSProperties => {
  const enter = progress(frame, 0, ENTER_FRAMES);
  const exit = progress(frame, duration - EXIT_FRAMES, EXIT_FRAMES);
  const shown = enter * (1 - exit);
  return {
    opacity: shown,
    filter: shown < 1 ? `blur(${mix(12, 0, shown)}px)` : undefined,
    transform: `scale(${mix(0.985, 1, enter) * mix(1, 1.015, exit)})`,
  };
};

const pushStyle = (
  duration: number,
  frame: number,
  leaves = true
): CSSProperties => {
  const enter = progress(frame, 0, PUSH_IN_FRAMES);
  const exit = leaves
    ? progress(frame, duration - PUSH_OUT_FRAMES, PUSH_OUT_FRAMES, easeIn)
    : 0;
  const offset = mix(PUSH_DISTANCE, 0, enter) - mix(0, PUSH_DISTANCE, exit);
  const blur = PUSH_BLUR * Math.max(1 - enter, exit);
  return {
    opacity: Math.min(enter * 2, 1 - exit),
    filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
    transform: `translateX(${offset}px)`,
  };
};

const NO_STYLE: CSSProperties = {};

const TRANSITION_STYLES = {
  soft: softStyle,
  push: pushStyle,
  "push-in": (duration, frame) => pushStyle(duration, frame, false),
  // A hard cut leaves the scene exactly as it is.
  cut: () => NO_STYLE,
} as const satisfies Record<
  Transition,
  (duration: number, frame: number) => CSSProperties
>;

export const Scene = ({
  duration,
  transition = "soft",
  children,
}: {
  duration: number;
  transition?: Transition;
  children: ReactNode;
}) => {
  const frame = useCurrentFrame();
  const style = TRANSITION_STYLES[transition](duration, frame);

  return (
    <AbsoluteFill style={style}>
      {transition === "push" ? (
        <Sequence
          from={duration - PUSH_OUT_FRAMES}
          durationInFrames={12}
          layout="none"
        >
          <Html5Audio src={staticFile("sfx/swish.wav")} volume={SWISH_VOLUME} />
        </Sequence>
      ) : null}
      {children}
    </AbsoluteFill>
  );
};
