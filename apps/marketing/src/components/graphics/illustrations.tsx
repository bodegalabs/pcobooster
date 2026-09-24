import { useId } from "react";

import { RocketMark } from "./rocket-mark";

import styles from "./graphics.module.css";

// A sparse sky: fixed stars that twinkle, and a few shooting stars that streak across now and
// then. Timing lives per element in `graphics.module.css`.
const STARS = [
  [64, 92, 1.6],
  [182, 214, 1.1],
  [268, 58, 1.3],
  [356, 318, 1],
  [424, 146, 1.7],
  [538, 44, 1.1],
  [612, 262, 1.3],
  [706, 118, 1],
  [792, 36, 1.5],
  [868, 228, 1.1],
  [944, 96, 1.3],
  [1036, 300, 1],
  [1108, 60, 1.6],
  [1164, 188, 1.1],
  [132, 388, 1],
  [980, 420, 1.2],
  [300, 470, 1.1],
  [1080, 520, 1],
] as const;

const SHOOTING_STARS = [
  { x: 180, y: 70, length: 150 },
  { x: 700, y: 30, length: 190 },
  { x: 430, y: 180, length: 120 },
] as const;

/** Twinkling stars and the occasional shooting star behind the sage bands. */
export const StarField = () => {
  const id = useId();
  return (
    <svg
      className={styles.field}
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-tail`}>
          <stop
            offset="0%"
            stopColor="var(--color-mask-visible)"
            stopOpacity="0"
          />
          <stop offset="100%" stopColor="var(--color-mask-visible)" />
        </linearGradient>
      </defs>
      <g className={styles.stars}>
        {STARS.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <g className={styles.meteors}>
        {SHOOTING_STARS.map((star) => (
          <g
            key={star.x}
            transform={`translate(${star.x} ${star.y}) rotate(24)`}
          >
            <g className={styles.meteor}>
              <rect
                x={-star.length}
                y="-0.9"
                width={star.length}
                height="1.8"
                rx="0.9"
                fill={`url(#${id}-tail)`}
              />
              <circle cx="0" cy="0" r="2.2" />
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
};

/** Step one: plans, people, and history flow in; assignments flow back. */
export const ConnectGraphic = () => (
  <svg className={styles.scene} viewBox="0 0 320 200" aria-hidden="true">
    <rect
      className={styles.paper}
      x="20"
      y="46"
      width="96"
      height="108"
      rx="16"
    />
    <rect className={styles.faint} x="40" y="68" width="56" height="8" rx="4" />
    {[0, 1, 2].map((row) =>
      [0, 1, 2, 3].map((column) => (
        <rect
          key={`${row}-${column}`}
          className={row === 1 && column === 2 ? styles.brand : styles.faint}
          x={40 + column * 15}
          y={86 + row * 15}
          width="11"
          height="11"
          rx="3"
        />
      ))
    )}
    <text className={styles.caption} x="68" y="178" textAnchor="middle">
      Planning Center
    </text>

    <rect
      className={styles.paper}
      x="204"
      y="46"
      width="96"
      height="108"
      rx="16"
    />
    <svg x="224" y="70" width="56" height="56" className={styles.logo}>
      <RocketMark />
    </svg>
    <text className={styles.caption} x="252" y="178" textAnchor="middle">
      PCOBooster
    </text>

    <line className={styles.wire} x1="126" y1="86" x2="194" y2="86" />
    <line className={styles.wire} x1="126" y1="114" x2="194" y2="114" />
    <g className={styles.packets}>
      <circle cx="130" cy="86" r="4" />
      <circle cx="130" cy="86" r="4" />
      <circle cx="130" cy="86" r="4" />
    </g>
    <circle className={styles["packet-out"]} cx="190" cy="114" r="4" />
  </svg>
);

const LINEUP_COLUMNS = [
  { x: 16, rows: 3 },
  { x: 116, rows: 3, open: 1 },
  { x: 216, rows: 2 },
] as const;

/** Step two: the lineup shows an open spot, and a click picks it. */
export const ChooseGraphic = () => (
  <svg className={styles.scene} viewBox="0 0 320 200" aria-hidden="true">
    {LINEUP_COLUMNS.map((column) => (
      <g key={column.x}>
        <rect
          className={styles.ink}
          x={column.x + 4}
          y="30"
          width="40"
          height="7"
          rx="3.5"
        />
        {Array.from({ length: column.rows }, (_, row) => {
          const y = 48 + row * 34;
          if ("open" in column && column.open === row) {
            return (
              <g key={row}>
                <rect
                  className={styles["open-slot"]}
                  x={column.x}
                  y={y}
                  width="88"
                  height="26"
                  rx="8"
                />
                <g className={styles["slot-fill"]}>
                  <rect
                    className={styles.soft}
                    x={column.x}
                    y={y}
                    width="88"
                    height="26"
                    rx="8"
                  />
                  <circle
                    className={styles.brand}
                    cx={column.x + 14}
                    cy={y + 13}
                    r="7"
                  />
                  <rect
                    className={styles.brand}
                    x={column.x + 27}
                    y={y + 10}
                    width="44"
                    height="6"
                    rx="3"
                  />
                </g>
              </g>
            );
          }
          return (
            <g key={row}>
              <rect
                className={styles.paper}
                x={column.x}
                y={y}
                width="88"
                height="26"
                rx="8"
              />
              <circle
                className={styles.faint}
                cx={column.x + 14}
                cy={y + 13}
                r="7"
              />
              <rect
                className={styles.faint}
                x={column.x + 27}
                y={y + 10}
                width={36 + ((row + column.x) % 3) * 8}
                height="6"
                rx="3"
              />
            </g>
          );
        })}
      </g>
    ))}
    <path
      className={styles.cursor}
      d="M0 0L0 17L4.6 12.8L7.6 19.4L10.6 18L7.7 11.6L13.6 11.2Z"
    />
  </svg>
);

const WEEKS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

const CANDIDATES = [
  { served: [1, 0, 1, 0, 0, 1, 0, 0], status: "available", name: 64 },
  { served: [1, 1, 0, 1, 1, 0, 1, 1], status: "blocked", name: 48 },
  { served: [0, 0, 1, 0, 0, 0, 1, 0], status: "available", name: 56 },
] as const;

/** Step three: availability and recent serving history, side by side. */
export const FitGraphic = () => (
  <svg className={styles.scene} viewBox="0 0 320 200" aria-hidden="true">
    {CANDIDATES.map((candidate, row) => {
      const y = 22 + row * 56;
      return (
        <g key={y}>
          <rect
            className={styles.paper}
            x="16"
            y={y}
            width="288"
            height="44"
            rx="12"
          />
          {row === 0 ? (
            <rect
              className={styles.pick}
              x="16"
              y={y}
              width="288"
              height="44"
              rx="12"
            />
          ) : null}
          <circle className={styles.faint} cx="38" cy={y + 22} r="10" />
          <rect
            className={styles.ink}
            x="56"
            y={y + 14}
            width={candidate.name}
            height="6"
            rx="3"
          />
          <rect
            className={styles.faint}
            x="56"
            y={y + 25}
            width="34"
            height="5"
            rx="2.5"
          />
          <g className={styles.weeks}>
            {WEEKS.map((week) => (
              <circle
                key={week}
                className={
                  candidate.served[week] === 1 ? styles.brand : styles.faint
                }
                cx={146 + week * 14}
                cy={y + 22}
                r="4.5"
              />
            ))}
          </g>
          {candidate.status === "available" ? (
            <g>
              <circle className={styles.ok} cx="280" cy={y + 22} r="9" />
              <path className={styles.tick} d={`M275.5 ${y + 22}l3 3 6-6`} />
            </g>
          ) : (
            <g>
              <circle className={styles.no} cx="280" cy={y + 22} r="9" />
              <path
                className={styles.cross}
                d={`M276.5 ${y + 18.5}l7 7m0-7l-7 7`}
              />
            </g>
          )}
        </g>
      );
    })}
  </svg>
);

const PEOPLE = [40, 100, 160, 220, 280] as const;

const People = ({ className }: { className: string }) => (
  <g className={className}>
    {PEOPLE.map((x) => (
      <g key={x}>
        <circle cx={x} cy="38" r="11" />
        <path d={`M${x - 20} 84c0-13 9-22 20-22s20 9 20 22z`} />
      </g>
    ))}
  </g>
);

/** About page: a soft light passes across the people behind the plan, one at a time. */
export const TeamSpotlight = () => {
  const id = useId();
  return (
    <svg className={styles.team} viewBox="0 0 320 96" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-light`}>
          <stop offset="35%" stopColor="var(--color-mask-visible)" />
          <stop
            offset="100%"
            stopColor="var(--color-mask-visible)"
            stopOpacity="0"
          />
        </radialGradient>
        <mask
          id={`${id}-mask`}
          maskUnits="userSpaceOnUse"
          x="-120"
          y="0"
          width="560"
          height="96"
        >
          <ellipse
            className={styles.spotlight}
            cx="160"
            cy="54"
            rx="46"
            ry="60"
            fill={`url(#${id}-light)`}
          />
        </mask>
      </defs>
      <People className={styles.person} />
      <g mask={`url(#${id}-mask)`}>
        <People className={styles["person-lit"]} />
      </g>
    </svg>
  );
};
