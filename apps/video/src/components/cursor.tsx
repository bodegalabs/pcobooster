import { easeInOut, mix, progress, pulse } from "../lib/motion";

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Step {
  readonly at: number;
  readonly travel: number;
  readonly click: boolean;
}

/** The cursor drifts in from below-right of its first stop. */
const ENTRY_OFFSET = { x: 140, y: 120 } as const;
const FADE_FRAMES = 8;
const PRESS_FRAMES = 7;
const RIPPLE_FRAMES = 18;

const positionAt = (
  frame: number,
  steps: readonly Step[],
  points: readonly (Point | null)[]
): Point | null => {
  const [first] = points;
  if (first === null || first === undefined) {
    return null;
  }
  let position: Point = {
    x: first.x + ENTRY_OFFSET.x,
    y: first.y + ENTRY_OFFSET.y,
  };
  for (const [index, step] of steps.entries()) {
    const target = points[index];
    if (target === null || target === undefined) {
      continue;
    }
    const amount = progress(
      frame,
      step.at - step.travel,
      step.travel,
      easeInOut
    );
    if (amount <= 0) {
      return position;
    }
    position = {
      x: mix(position.x, target.x, amount),
      y: mix(position.y, target.y, amount),
    };
    if (amount < 1) {
      return position;
    }
  }
  return position;
};

/** A macOS-style pointer that travels between measured targets and clicks them. */
export const Cursor = ({
  frame,
  steps,
  points,
  zoom,
}: {
  frame: number;
  steps: readonly Step[];
  points: readonly (Point | null)[];
  zoom: number;
}) => {
  const position = positionAt(frame, steps, points);
  const [firstStep] = steps;
  if (position === null || firstStep === undefined) {
    return null;
  }
  const appear = progress(
    frame,
    firstStep.at - firstStep.travel - FADE_FRAMES,
    FADE_FRAMES
  );
  const clicks = steps.filter((step) => step.click);
  const press = pulse(
    frame,
    clicks.map((step) => step.at),
    PRESS_FRAMES
  );
  // Keep the pointer a steady size on screen while the camera zooms.
  const size = 1 / Math.sqrt(zoom);

  return (
    <>
      {clicks.map((step) => {
        const ripple = progress(frame, step.at, RIPPLE_FRAMES);
        if (frame < step.at || ripple >= 1) {
          return null;
        }
        const diameter = mix(8, 56, ripple) * size;
        return (
          <div
            key={step.at}
            style={{
              position: "absolute",
              left: position.x - diameter / 2,
              top: position.y - diameter / 2,
              width: diameter,
              height: diameter,
              borderRadius: "50%",
              background: "color-mix(in oklch, var(--brand) 28%, transparent)",
              border:
                "2px solid color-mix(in oklch, var(--brand) 60%, transparent)",
              opacity: 1 - ripple,
              pointerEvents: "none",
            }}
          />
        );
      })}
      <svg
        viewBox="0 0 24 24"
        width={26}
        height={26}
        aria-hidden
        style={{
          position: "absolute",
          left: position.x - 5,
          top: position.y - 3,
          opacity: appear,
          transform: `scale(${size * mix(1, 0.84, press)})`,
          transformOrigin: "5px 3px",
          filter: "drop-shadow(0 2px 3px rgb(0 0 0 / 0.28))",
          pointerEvents: "none",
        }}
      >
        <path
          d="M5.5 3.2v15.6c0 .5.6.8 1 .4l3.6-3.5 2.4 5.5c.2.4.6.6 1 .4l1.7-.8c.4-.2.6-.6.4-1l-2.4-5.4h5c.5 0 .8-.6.4-1L6.4 2.8c-.4-.4-.9-.1-.9.4Z"
          fill="var(--primary)"
          stroke="var(--primary-foreground)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
};
