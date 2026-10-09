import {
  AbsoluteFill,
  random,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const DOTS = 54;

/**
 * The site's sage stage with a soft light from above and a slow field of dots drifting
 * past, echoing the hero's star field. It runs on the composition's frame, so it carries
 * on unbroken under every scene cut.
 */
export const Backdrop = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, var(--stage-light) 0%, var(--stage) 62%)",
      }}
    >
      <svg
        width={width}
        height={height}
        aria-hidden
        style={{ position: "absolute" }}
      >
        {Array.from({ length: DOTS }, (_, index) => {
          const speed = 0.25 + random(`speed-${index}`) * 0.6;
          const x =
            ((random(`x-${index}`) * (width + 200) + frame * speed) %
              (width + 200)) -
            100;
          const y = random(`y-${index}`) * height - frame * speed * 0.35;
          const wrappedY = ((y % height) + height) % height;
          const radius = 1.5 + random(`r-${index}`) * 2.5;
          const twinkle = 0.5 + 0.5 * Math.sin(frame / 22 + index);
          return (
            <circle
              key={index}
              cx={x}
              cy={wrappedY}
              r={radius}
              fill="var(--logo)"
              opacity={
                (0.08 + random(`o-${index}`) * 0.14) * (0.6 + 0.4 * twinkle)
              }
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
