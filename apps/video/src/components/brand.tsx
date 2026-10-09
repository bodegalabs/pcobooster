import { useId } from "react";
import type { CSSProperties } from "react";

import { mix } from "../lib/motion";

const HULL =
  "M121 103C158 89 196 100 219 122Q225 128 219 134C196 156 158 167 121 153Q112 149 112 140V116Q112 107 121 103Z";

/**
 * The PCOBooster rocket (apps/marketing/public/logo.svg), with frame-driven exhaust:
 * `thrust` stretches the trails back from the hull, `drift` (0 → 1, looping) sheds puffs.
 */
export const Rocket = ({
  size,
  thrust = 0,
  drift = 0,
  color = "var(--logo)",
  style,
}: {
  size: number;
  thrust?: number;
  drift?: number;
  color?: string;
  style?: CSSProperties;
}) => {
  const id = useId();
  const finMask = `${id}-fins`;
  const windowMask = `${id}-window`;
  const stretch = mix(0, 26, thrust);
  const puffs = [0, 0.33, 0.66].map((offset) => (drift + offset) % 1);

  return (
    <svg
      viewBox="46 42 168 168"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      style={{ overflow: "visible", ...style }}
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
      <g
        transform="translate(128 128) rotate(-45) scale(1.12) translate(-128 -128)"
        fill={color}
      >
        {thrust > 0
          ? puffs.map((amount, index) => (
              <circle
                key={index}
                cx={mix(44, -10, amount)}
                cy={[110, 128, 146][index]}
                r={mix(5, 1.5, amount)}
                opacity={thrust * (1 - amount) * 0.7}
              />
            ))
          : null}
        <g mask={`url(#${finMask})`}>
          <path d="M150 104C137 90 127 83 118 82Q112 82 112 89V104Z" />
          <path d="M150 152C137 166 127 173 118 174Q112 174 112 167V152Z" />
        </g>
        <path d={HULL} mask={`url(#${windowMask})`} />
        <rect
          x={71 - stretch}
          y="104"
          width={33 + stretch}
          height="12"
          rx="6"
        />
        <rect
          x={65 - stretch * 1.3}
          y="122"
          width={33 + stretch * 1.3}
          height="12"
          rx="6"
        />
        <rect
          x={71 - stretch}
          y="140"
          width={33 + stretch}
          height="12"
          rx="6"
        />
        <circle cx={59 - stretch * 1.15} cy="110" r="6" />
        <circle cx={53 - stretch * 1.45} cy="128" r="6" />
        <circle cx={59 - stretch * 1.15} cy="146" r="6" />
      </g>
    </svg>
  );
};

/** PCOBooster's wordmark, as the site header sets it. */
export const Wordmark = ({
  size,
  style,
}: {
  size: number;
  style?: CSSProperties;
}) => (
  <span
    style={{
      fontSize: size,
      fontWeight: 450,
      letterSpacing: "-0.03em",
      color: "var(--foreground)",
      lineHeight: 1,
      ...style,
    }}
  >
    <strong style={{ fontWeight: 650 }}>PCO</strong>Booster
  </span>
);

/**
 * The Planning Center Services app mark, unaltered, as the product shows it
 * (apps/web/src/components/planning-center-services-icon.tsx). Planning Center's usage
 * rules: full color on a light solid background, clear space of at least the icon's
 * height, never locked up with our mark or used inside a phrase.
 */
export const ServicesMark = ({
  size,
  style,
}: {
  size: number;
  style?: CSSProperties;
}) => {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 42 42"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      style={style}
    >
      <path
        fill={`url(#${gradientId})`}
        d="M21 0C4.196 0 0 4.2 0 21s4.197 21 21 21c16.801 0 21-4.197 21-21S37.8 0 21 0"
      />
      <path
        fill="var(--pc-services-foreground)"
        d="M11.398 16.544a2.216 2.216 0 1 0 0-4.433 2.216 2.216 0 0 0 0 4.433m0 7.209a2.216 2.216 0 1 0 0-4.432 2.216 2.216 0 0 0 0 4.432m0 7.21a2.216 2.216 0 1 0 0-4.433 2.216 2.216 0 0 0 0 4.433m20.016-15.649c0 .561-.455 1.016-1.016 1.016H17.036a1.016 1.016 0 0 1-1.016-1.016V13.34c0-.561.455-1.016 1.016-1.016h13.359c.56 0 1.015.455 1.015 1.016zm-15.391 4.851c0-.35.284-.632.633-.632h14.126c.349 0 .631.283.631.632v2.744a.63.63 0 0 1-.631.632H16.656a.63.63 0 0 1-.633-.632zm0 7.21c0-.35.284-.633.633-.633h14.126c.349 0 .631.283.631.633v2.744a.63.63 0 0 1-.631.632H16.656a.63.63 0 0 1-.633-.632z"
      />
      <defs>
        <linearGradient
          id={gradientId}
          x1="-12.6"
          x2="21"
          y1="21"
          y2="54.599"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--pc-services-gradient-start)" />
          <stop offset=".999" stopColor="var(--pc-services-gradient-end)" />
        </linearGradient>
      </defs>
    </svg>
  );
};
