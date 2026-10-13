import { useId } from "react";

/**
 * The night sky behind marketing's sage bands and the product's welcome guide
 * (`@pcobooster/ui/star-field`): fixed stars that twinkle, and a few shooting stars that streak
 * across now and then. It fills its nearest positioned ancestor, under its content. Timing lives
 * in `@pcobooster/ui/star-field.css`, which each app's stylesheet imports.
 */

/** The sky for a wide band, laid out on a 1200 × 700 canvas. */
const BAND_STARS = [
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

const BAND_SHOOTING_STARS = [
  { x: 180, y: 70, length: 150 },
  { x: 700, y: 30, length: 190 },
  { x: 430, y: 180, length: 120 },
] as const;

/** A denser sky for a short header, laid out on a 600 × 200 canvas so stars keep their size. */
const HEADER_STARS = [
  [34, 28, 1.3],
  [92, 132, 1],
  [148, 62, 1.5],
  [196, 168, 1.1],
  [238, 22, 1],
  [286, 104, 1.2],
  [342, 40, 1.4],
  [388, 150, 1],
  [436, 74, 1.1],
  [478, 178, 1.3],
  [522, 30, 1],
  [566, 118, 1.5],
  [64, 186, 1.1],
  [262, 186, 1],
  [592, 60, 1.1],
  [12, 96, 1],
] as const;

const HEADER_SHOOTING_STARS = [
  { x: 150, y: 36, length: 90 },
  { x: 430, y: 20, length: 110 },
  { x: 300, y: 120, length: 70 },
] as const;

const skies = {
  band: {
    viewBox: "0 0 1200 700",
    stars: BAND_STARS,
    shootingStars: BAND_SHOOTING_STARS,
  },
  header: {
    viewBox: "0 0 600 200",
    stars: HEADER_STARS,
    shootingStars: HEADER_SHOOTING_STARS,
  },
} as const;

export const StarField = ({
  variant = "band",
}: {
  /** `band` for a tall section; `header` for a short strip, such as a dialog header. */
  variant?: keyof typeof skies;
}) => {
  const id = useId();
  const sky = skies[variant];
  return (
    <svg
      data-slot="star-field"
      viewBox={sky.viewBox}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-tail`}>
          <stop data-slot="star-field-tail-start" offset="0%" stopOpacity="0" />
          <stop data-slot="star-field-tail-end" offset="100%" />
        </linearGradient>
      </defs>
      <g data-slot="star-field-stars">
        {sky.stars.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <g data-slot="star-field-meteors">
        {sky.shootingStars.map((star) => (
          <g
            key={star.x}
            transform={`translate(${star.x} ${star.y}) rotate(24)`}
          >
            <g data-slot="star-field-meteor">
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
