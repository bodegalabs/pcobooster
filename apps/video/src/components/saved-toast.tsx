import { Html5Audio, Sequence, staticFile, useCurrentFrame } from "remotion";

import { useFeatureLayout } from "../lib/layout";
import { mix, pop } from "../lib/motion";

const SAVED_VOLUME = 0.5;

const CheckIcon = ({ size }: { size: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * The payoff of a change: a toast that rises over the bottom of the product window with a
 * soft chime, saying where the change went.
 */
export const SavedToast = ({
  at,
  label = "Saved to Planning Center",
}: {
  at: number;
  label?: string;
}) => {
  const frame = useCurrentFrame();
  const layout = useFeatureLayout();
  const { product } = layout;
  const height = (layout.nativeHeight * product.width) / layout.nativeWidth;
  const shown = pop(frame, at);
  if (frame < at) {
    return null;
  }

  return (
    <>
      <Sequence from={at} durationInFrames={30} layout="none">
        <Html5Audio src={staticFile("sfx/saved.wav")} volume={SAVED_VOLUME} />
      </Sequence>
      <div
        style={{
          position: "absolute",
          left: product.left + product.width / 2,
          top: product.top + height - 56,
          transform: `translate(-50%, -100%) translateY(${mix(40, 0, shown)}px) scale(${mix(0.9, 1, Math.min(1, shown))})`,
          opacity: Math.min(1, shown),
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "20px 34px 20px 22px",
          borderRadius: 999,
          background: "var(--primary)",
          color: "var(--primary-foreground)",
          boxShadow: "var(--shadow-frame)",
          fontSize: 34,
          fontWeight: 550,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--status-confirmed)",
            color: "white",
          }}
        >
          <CheckIcon size={26} />
        </span>
        {label}
      </div>
    </>
  );
};
