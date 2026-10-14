import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";

import { mix, progress } from "../lib/motion";

const ENTER_FRAMES = 10;
const EXIT_FRAMES = 9;
const BLUR = 8;
/** Exits start gently and speed up into the cut, so the first frame of a fade never jumps. */
const exitEase = Easing.bezier(0.55, 0, 0.75, 0.3);

/**
 * How a scene meets its neighbours: `soft` focuses in at its start and blurs out at its
 * end; `cut` is a hard cut. Neither overlaps the next scene, which would mount two
 * replicas that both drive the replica's shared stores.
 */
export type Transition = "soft" | "cut";

const softStyle = (duration: number, frame: number): CSSProperties => {
  const enter = progress(frame, 0, ENTER_FRAMES);
  const exit = progress(frame, duration - EXIT_FRAMES, EXIT_FRAMES, exitEase);
  const shown = enter * (1 - exit);
  return {
    opacity: shown,
    filter: shown < 1 ? `blur(${mix(BLUR, 0, shown)}px)` : undefined,
    transform: `scale(${mix(0.985, 1, enter) * mix(1, 1.015, exit)})`,
  };
};

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
  return (
    <AbsoluteFill
      style={transition === "soft" ? softStyle(duration, frame) : undefined}
    >
      {children}
    </AbsoluteFill>
  );
};
