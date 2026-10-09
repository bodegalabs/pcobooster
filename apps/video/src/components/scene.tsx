import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import { mix, progress } from "../lib/motion";

const ENTER_FRAMES = 10;
const EXIT_FRAMES = 9;

/**
 * One scene's frame: it focuses in at its start and softly blurs out at its end, so scenes
 * can cut back to back without overlapping. Overlap would mount two replicas that both
 * drive the replica's shared stores.
 */
export const Scene = ({
  duration,
  children,
}: {
  duration: number;
  children: ReactNode;
}) => {
  const frame = useCurrentFrame();
  const enter = progress(frame, 0, ENTER_FRAMES);
  const exit = progress(frame, duration - EXIT_FRAMES, EXIT_FRAMES);
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
