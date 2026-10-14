import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import { mix, progress } from "../lib/motion";

const ENTER_FRAMES = 10;
const EXIT_FRAMES = 9;

/**
 * How a scene meets its neighbours: `soft` focuses in at its start and blurs out at its
 * end; `cut` is a hard cut, the pace of a feed video. Neither overlaps the next scene, which
 * would mount two replicas that both drive the replica's shared stores.
 */
export type Transition = "soft" | "cut";

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
  const soft = transition === "soft";
  const enter = soft ? progress(frame, 0, ENTER_FRAMES) : 1;
  const exit = soft ? progress(frame, duration - EXIT_FRAMES, EXIT_FRAMES) : 0;
  const shown = enter * (1 - exit);

  return (
    <AbsoluteFill
      style={{
        opacity: shown,
        filter: shown < 1 ? `blur(${mix(12, 0, shown)}px)` : undefined,
        transform: `scale(${mix(0.985, 1, enter) * mix(1, 1.015, exit)})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
