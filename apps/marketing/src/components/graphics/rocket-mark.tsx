import { useId } from "react";

import styles from "./graphics.module.css";

const HULL =
  "M121 103C158 89 196 100 219 122Q225 128 219 134C196 156 158 167 121 153Q112 149 112 140V116Q112 107 121 103Z";

/**
 * The product's rocket logo, inline so its parts can move. `hover` nudges the rocket and
 * stretches its trails when the surrounding `[data-rocket-hover]` link is hovered; `cruise`
 * keeps it gently flying with exhaust drifting off behind it.
 */
export const RocketMark = ({
  motion = "none",
  className,
}: {
  motion?: "none" | "hover" | "cruise";
  className?: string;
}) => {
  const id = useId();
  const finMask = `${id}-fins`;
  const windowMask = `${id}-window`;
  const cruise = motion === "cruise";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={cruise ? "0 0 256 256" : "46 42 168 168"}
      fill="none"
      aria-hidden="true"
      className={className}
      data-motion={motion}
    >
      <defs>
        <mask
          id={finMask}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="256"
          height="256"
        >
          <rect width="256" height="256" fill="var(--color-mask-visible)" />
          <path
            d={HULL}
            fill="var(--color-mask-hidden)"
            stroke="var(--color-mask-hidden)"
            strokeWidth="12"
            strokeLinejoin="round"
          />
        </mask>
        <mask
          id={windowMask}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="256"
          height="256"
        >
          <rect width="256" height="256" fill="var(--color-mask-visible)" />
          <circle cx="176" cy="128" r="13" fill="var(--color-mask-hidden)" />
        </mask>
      </defs>
      <g className={styles.flight}>
        <g
          transform="translate(128 128) rotate(-45) scale(1.12) translate(-128 -128)"
          fill="currentColor"
        >
          {cruise ? (
            <g className={styles.particles}>
              <circle cx="50" cy="110" r="5" />
              <circle cx="44" cy="128" r="5" />
              <circle cx="50" cy="146" r="5" />
              <circle cx="46" cy="119" r="3.5" />
              <circle cx="46" cy="137" r="3.5" />
            </g>
          ) : null}
          <g mask={`url(#${finMask})`}>
            <path d="M150 104C137 90 127 83 118 82Q112 82 112 89V104Z" />
            <path d="M150 152C137 166 127 173 118 174Q112 174 112 167V152Z" />
          </g>
          <path d={HULL} mask={`url(#${windowMask})`} />
          <g className={styles.exhaust}>
            <rect x="71" y="104" width="33" height="12" rx="6" />
            <rect x="65" y="122" width="33" height="12" rx="6" />
            <rect x="71" y="140" width="33" height="12" rx="6" />
            <circle cx="59" cy="110" r="6" />
            <circle cx="53" cy="128" r="6" />
            <circle cx="59" cy="146" r="6" />
          </g>
        </g>
      </g>
    </svg>
  );
};
