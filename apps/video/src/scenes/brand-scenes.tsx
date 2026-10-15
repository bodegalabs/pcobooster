import type { CSSProperties, ReactNode } from "react";
import {
  Html5Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { Rocket, ServicesMark, Wordmark } from "../components/brand";
import { Headline, Subline } from "../components/headline";
import type { Lines } from "../components/headline";
import { Scene } from "../components/scene";
import type { Transition } from "../components/scene";
import { PORTRAIT_SAFE, useFormat } from "../lib/format";
import { useStatementSize } from "../lib/layout";
import {
  easeInOut,
  easeOut,
  mix,
  pop,
  progress,
  pulse,
  settle,
} from "../lib/motion";

const Center = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      ...style,
    }}
  >
    {children}
  </div>
);

const UserPlusIcon = ({ size }: { size: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" x2="19" y1="8" y2="14" />
    <line x1="22" x2="16" y1="11" y2="11" />
  </svg>
);

const CheckIcon = ({ size }: { size: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/** An open slot as the lineup shows one: a dashed seat and a red "Open". */
const OpenChip = ({ position, scale }: { position: string; scale: number }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 14 * scale,
      padding: `${12 * scale}px ${22 * scale}px ${12 * scale}px ${12 * scale}px`,
      borderRadius: 999,
      background: "white",
      boxShadow: "var(--shadow-frame)",
      fontSize: 24 * scale,
      whiteSpace: "nowrap",
    }}
  >
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: 44 * scale,
        height: 44 * scale,
        borderRadius: "50%",
        // The lineup's open seat: a dashed ring at half strength, drawn thick enough to
        // read as the app's 1px ring does once the feed shrinks the frame to phone size.
        border: `${2 * scale}px dashed color-mix(in oklab, var(--status-declined) 50%, transparent)`,
        color: "var(--status-declined)",
      }}
    >
      <UserPlusIcon size={20 * scale} />
    </span>
    <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
      {position}
    </span>
    <span
      style={{
        color: "var(--status-declined)",
        fontWeight: 500,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      Open
    </span>
  </div>
);

const OPEN_CHIPS = [
  {
    position: "Acoustic Guitar",
    landscape: [0.17, 0.2],
    portrait: [0.3, 0.219],
    feed: [0.3, 0.16],
  },
  {
    position: "Drums",
    landscape: [0.83, 0.16],
    portrait: [0.72, 0.292],
    feed: [0.74, 0.25],
  },
  {
    position: "Sound",
    landscape: [0.12, 0.78],
    portrait: [0.26, 0.616],
    feed: [0.26, 0.75],
  },
  {
    position: "Tenor",
    landscape: [0.86, 0.74],
    portrait: [0.76, 0.666],
    feed: [0.75, 0.82],
  },
  {
    position: "Greeter",
    landscape: [0.5, 0.88],
    portrait: [0.42, 0.716],
    feed: [0.45, 0.9],
  },
] as const;

/** The hook's headline on tall formats, filling the 4:5 and 9:16 width at feed size. */
const HOOK_TALL_SIZE = 108;
/** The question reads first; the open slots then land one by one from the first beat. */
const HOOK_CHIPS_AT = 20;
/** Hooks at least this long (the demo's six beats) give each slot a half beat. */
const HOOK_FULL_FRAMES = 120;

/**
 * The problem, in the leader's words, with Sunday's open slots floating around it. An
 * `instant` hook is fully composed on its first frame, which feeds use as the thumbnail.
 */
export const HookScene = ({
  duration,
  lines,
  instant = false,
  transition = "soft",
}: {
  duration: number;
  lines: Lines;
  instant?: boolean;
  transition?: Transition;
}) => {
  const frame = useCurrentFrame();
  const format = useFormat();
  const { width, height } = useVideoConfig();
  const statementSize = useStatementSize();
  const landscape = format === "landscape";
  const size = landscape ? statementSize : HOOK_TALL_SIZE;
  const chipScale = landscape ? 1.15 : 1.35;
  // A full-length hook pops a slot on each half beat; a short one (the teaser) twice as fast.
  const chipEvery = duration >= HOOK_FULL_FRAMES ? 10 : 5;

  return (
    <Scene duration={duration} transition={transition}>
      {OPEN_CHIPS.map((chip, index) => {
        const [x, y] = chip[format];
        const shown = instant
          ? 1
          : pop(frame, HOOK_CHIPS_AT + index * chipEvery);
        const float = Math.sin((frame + index * 17) / 24) * 8;
        return (
          <div
            key={chip.position}
            style={{
              position: "absolute",
              left: x * width,
              top: y * height + float,
              transform: `translate(-50%, -50%) scale(${shown})`,
              opacity: Math.min(1, shown),
            }}
          >
            <OpenChip position={chip.position} scale={chipScale} />
          </div>
        );
      })}
      <Center
        style={
          format === "portrait"
            ? {
                padding: "0 60px",
                top: PORTRAIT_SAFE.top,
                bottom: height - PORTRAIT_SAFE.bottom,
              }
            : { padding: "0 60px" }
        }
      >
        <Headline
          lines={lines}
          size={size}
          at={2}
          stagger={3}
          pace={instant ? "instant" : "reveal"}
        />
      </Center>
    </Scene>
  );
};

/** Where the work already lives: the Services mark with its full clear space. */
export const ServicesScene = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const portrait = useFormat() === "portrait";
  const markSize = portrait ? 150 : 128;
  const shown = pop(frame, 2);

  return (
    <Scene duration={duration}>
      <Center>
        <div
          style={{ transform: `scale(${shown})`, opacity: Math.min(1, shown) }}
        >
          <ServicesMark size={markSize} />
        </div>
        {/* Planning Center asks for clear space at least the icon's height. */}
        <div style={{ height: markSize }} />
        <Headline
          lines={{
            landscape: [
              "Your church already runs on",
              "*Planning Center Services.*",
            ],
            portrait: [
              "Your church",
              "already runs on",
              "*Planning Center Services.*",
            ],
          }}
          size={portrait ? 74 : 92}
          at={8}
          style={{ padding: "0 50px", marginBottom: markSize * 0.6 }}
        />
      </Center>
    </Scene>
  );
};

const WORKSPACE_LINE =
  "The workspace ministry leaders open every week, on top of the Services you already use.";

/**
 * The site header's lockup (apps/marketing/src/components/site.tsx `Brand`, and the app's
 * sidebar and sign-in): the wordmark, then the rocket at 1.5em, 0.4em after it.
 */
const ROCKET_EM = 1.5;
const LOCKUP_GAP_EM = 0.4;
/** The rocket comes in along its own heading (45° up and right) to land beside the name. */
const FLIGHT_DISTANCE = 460;
/** The site's `cruise` bob once it has landed: a few pixels along its heading. */
const CRUISE_EM = 0.035;
const CRUISE_FRAMES = 96;

/**
 * The rocket flies in as the name unrolls behind it, the way the app's sidebar brand opens,
 * and the line lands: "Planning Center, boosted." Each part arrives on a beat.
 */
export const BrandScene = ({
  duration,
  subline = WORKSPACE_LINE,
}: {
  duration: number;
  /** The supporting line; `false` leaves it out of short cuts, where it can't be read. */
  subline?: string | false;
}) => {
  const frame = useCurrentFrame();
  // The 4:5 feed shares portrait's width, so it takes portrait's sizes.
  const portrait = useFormat() !== "landscape";
  const wordmarkSize = portrait ? 112 : 132;
  const rocketSize = wordmarkSize * ROCKET_EM;
  // Lands on the first beat (frame 20); the name unrolls left to right as it arrives.
  const flight = progress(frame, 0, 30, easeOut);
  const unroll = progress(frame, 6, 18, easeOut);
  const thrust = mix(1, 0.2, progress(frame, 12, 24));
  const cruise =
    Math.sin((Math.PI * Math.max(0, frame - 20)) / CRUISE_FRAMES) *
    CRUISE_EM *
    rocketSize;
  const offset = mix(FLIGHT_DISTANCE, 0, flight);

  return (
    <Scene duration={duration}>
      <Center>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: wordmarkSize * LOCKUP_GAP_EM,
          }}
        >
          <Wordmark
            size={wordmarkSize}
            style={{
              clipPath: `inset(-10% ${mix(100, 0, unroll)}% -10% 0)`,
              opacity: mix(0.75, 1, unroll),
            }}
          />
          <div
            style={{
              transform: `translate(${cruise - offset}px, ${offset - cruise}px)`,
            }}
          >
            <Rocket
              size={rocketSize}
              thrust={thrust}
              drift={(frame / 30) % 1}
            />
          </div>
        </div>
        <Headline
          lines={["Planning Center, *boosted.*"]}
          size={portrait ? 80 : 76}
          at={36}
          style={{ marginTop: portrait ? 72 : 60 }}
        />
        {subline === false ? null : (
          <Subline
            at={56}
            size={portrait ? 42 : 34}
            style={{ marginTop: 22, maxWidth: portrait ? 860 : 1000 }}
          >
            {subline}
          </Subline>
        )}
      </Center>
    </Scene>
  );
};

const STEPS = [
  {
    title: "Sign in with Planning Center",
    detail:
      "Your services, teams, people, and songs are there the moment you connect.",
  },
  {
    title: "Work from one clear view",
    detail: "Plans, availability, serving history, and charts side by side.",
  },
  {
    title: "Changes save to Planning Center",
    detail: "Your team keeps using Planning Center like always.",
  },
] as const;

/** The three-step promise from the site: nothing to move, nothing to sync. */
export const HowItWorksScene = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const portrait = useFormat() === "portrait";

  return (
    <Scene duration={duration}>
      <Center
        style={
          portrait
            ? {
                justifyContent: "flex-start",
                paddingTop: PORTRAIT_SAFE.top + 20,
              }
            : undefined
        }
      >
        <Headline
          lines={["Nothing to move.", "*Nothing to sync.*"]}
          size={portrait ? 92 : 96}
          at={2}
        />
        <ol
          style={{
            listStyle: "none",
            margin: `${portrait ? 70 : 72}px 0 0`,
            padding: 0,
            display: "grid",
            gridTemplateColumns: portrait ? "1fr" : "repeat(3, 1fr)",
            gap: portrait ? 26 : 32,
            width: portrait ? 900 : 1560,
            textAlign: "left",
          }}
        >
          {STEPS.map((step, index) => {
            const shown = settle(frame, 26 + index * 12, 26);
            return (
              <li
                key={step.title}
                style={{
                  background: "white",
                  borderRadius: 28,
                  boxShadow: "var(--shadow-frame)",
                  padding: portrait ? "34px 38px" : "40px 40px 44px",
                  opacity: shown,
                  transform: `translateY(${mix(40, 0, shown)}px)`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <span
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "var(--brand-soft)",
                      color: "var(--brand)",
                      fontSize: 24,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </span>
                  <span
                    style={{
                      fontSize: portrait ? 36 : 32,
                      fontWeight: 550,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {step.title}
                  </span>
                </div>
                <p
                  style={{
                    margin: "18px 0 0",
                    fontSize: portrait ? 28 : 25,
                    lineHeight: 1.45,
                    color: "var(--muted-foreground)",
                  }}
                >
                  {step.detail}
                </p>
              </li>
            );
          })}
        </ol>
      </Center>
    </Scene>
  );
};

/** Lucide's `music-2`, the note the product marks songs with. */
const SongIcon = ({ size }: { size: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="8" cy="18" r="4" />
    <path d="M12 18V2l7 4" />
  </svg>
);

export interface Change {
  /** Initials for a person; a song shows a note instead. */
  readonly badge: string | null;
  /** A person asked to serve, not yet answered: the product's amber "Pending" dot. */
  readonly pending?: boolean;
  readonly title: string;
  readonly detail: string;
}

const CHANGES: readonly Change[] = [
  {
    badge: "HC",
    pending: true,
    title: "Hayden Collins",
    detail: "Acoustic Guitar · Pending",
  },
  {
    badge: null,
    title: "Steady Ground",
    detail: "Key changed from Eb to D",
  },
  { badge: null, title: "Morning Light", detail: "Chords transposed to A" },
] as const;

/** The chime under each row's save, softer than the toast's since three play in a row. */
const SAVED_VOLUME = 0.28;
/** One beat of the feed cuts' 90 BPM bed: each row's save lands on the next beat. */
const SAVE_BEAT = 20;
/** Rows cascade in this many frames apart as the scene opens. */
const ROW_STAGGER = 4;
/** Frames a save dot flies from its row to the Services mark. */
const SAVE_FLIGHT = 16;
/** The frame row `index` saves on: one beat after the one before it. */
const landAt = (index: number): number => (index + 1) * SAVE_BEAT;
/** How far the dot stops short of the mark, so it never draws over the logo. */
const MARK_GAP = 18;
/** Where the save dot turns from the right gutter toward the mark, in portrait. */
const GUTTER_TURN = 80;

/** Row type and badge sizes: larger on the phone-first formats, to read at feed size. */
const ROW_SIZES = {
  landscape: {
    height: 128,
    gap: 22,
    padding: 32,
    badge: 60,
    initials: 22,
    icon: 26,
    title: 30,
    detail: 24,
    status: 22,
  },
  portrait: {
    height: 150,
    gap: 20,
    padding: 36,
    badge: 76,
    initials: 27,
    icon: 32,
    title: 40,
    detail: 31,
    status: 28,
  },
} as const;

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A point `travel` of the way down the right gutter beside the rows and round a corner
 * into the mark's side, so a dot from the top row never crosses the rows under it.
 */
const gutterPoint = (
  from: Point,
  to: Point,
  radius: number,
  travel: number
): Point => {
  const drop = Math.max(0, to.y - radius - from.y);
  const corner = (Math.PI * radius) / 2;
  const run = Math.max(0, from.x - radius - to.x);
  const along = travel * (drop + corner + run);
  if (along <= drop) {
    return { x: from.x, y: from.y + along };
  }
  if (along <= drop + corner) {
    const angle = (along - drop) / radius;
    return {
      x: from.x - radius + Math.cos(angle) * radius,
      y: to.y - radius + Math.sin(angle) * radius,
    };
  }
  return { x: from.x - radius - (along - drop - corner), y: to.y };
};

/** The changes from the earlier scenes, each saving back to Planning Center Services. */
export const SavesBackScene = ({
  duration,
  changes = CHANGES,
}: {
  duration: number;
  /** The changes the cut made, in the order it made them. */
  changes?: readonly Change[];
}) => {
  const frame = useCurrentFrame();
  const format = useFormat();
  const portrait = format !== "landscape";
  const sizes = ROW_SIZES[portrait ? "portrait" : "landscape"];
  const rowWidth = portrait ? 900 : 860;
  const markSize = portrait ? 140 : 150;
  // Row column and mark positions, with the mark's clear space (its height) kept empty.
  const layouts = {
    landscape: {
      headlineTop: 80,
      rows: { left: 230, top: 410 },
      mark: { left: 1500, top: 540 - markSize / 2 },
    },
    portrait: {
      headlineTop: PORTRAIT_SAFE.top + 10,
      rows: { left: 90, top: 620 },
      mark: { left: 540 - markSize / 2, top: 1250 },
    },
    feed: {
      headlineTop: 80,
      rows: { left: 90, top: 400 },
      mark: { left: 540 - markSize / 2, top: 1030 },
    },
  } as const;
  const { rows, mark, headlineTop } = layouts[format];
  const markMiddle = mark.top + markSize / 2;
  // Larger on the phone formats, where the dot flies further and plays smaller.
  const dotSize = portrait ? 24 : 18;

  return (
    <Scene duration={duration}>
      <div
        style={{
          position: "absolute",
          top: headlineTop,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Headline
          lines={{
            landscape: [
              "Every change saves",
              "*straight back to Planning Center.*",
            ],
            portrait: [
              "Every change saves",
              "*straight back to*",
              "*Planning Center.*",
            ],
          }}
          size={portrait ? 78 : 76}
          at={0}
          style={{ maxWidth: portrait ? 960 : 1600 }}
        />
      </div>
      {changes.map((change, index) => {
        const appear = settle(frame, index * ROW_STAGGER, 20);
        const landed = landAt(index);
        const travel = progress(
          frame,
          landed - SAVE_FLIGHT,
          SAVE_FLIGHT,
          easeInOut
        );
        const saved = frame >= landed;
        const top = rows.top + index * (sizes.height + sizes.gap);
        const from = {
          x: rows.left + rowWidth + (portrait ? 34 : 14),
          y: top + sizes.height / 2,
        };
        const dot = portrait
          ? gutterPoint(
              from,
              { x: mark.left + markSize + MARK_GAP, y: markMiddle },
              GUTTER_TURN,
              travel
            )
          : {
              x: mix(from.x, mark.left - MARK_GAP, travel),
              y:
                mix(from.y, markMiddle, travel) -
                Math.sin(travel * Math.PI) * 60,
            };
        // The dot fades in leaving its row and out as it reaches the mark's edge.
        const dotShown = Math.min(1, travel / 0.15, (1 - travel) / 0.25);
        return (
          <div key={change.title}>
            <Sequence from={landed} durationInFrames={30} layout="none">
              <Html5Audio
                src={staticFile("sfx/saved.wav")}
                volume={SAVED_VOLUME}
              />
            </Sequence>
            <div
              style={{
                position: "absolute",
                left: rows.left,
                top,
                width: rowWidth,
                height: sizes.height,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                gap: sizes.padding * 0.75,
                padding: `0 ${sizes.padding}px`,
                background: "white",
                borderRadius: 24,
                boxShadow: "var(--shadow-frame)",
                opacity: appear,
                transform: `translateX(${mix(-40, 0, appear)}px)`,
              }}
            >
              {/* The product's avatar: muted fill, hairline border, a status dot. */}
              <span style={{ position: "relative", flexShrink: 0 }}>
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: sizes.badge,
                    height: sizes.badge,
                    boxSizing: "border-box",
                    borderRadius: "50%",
                    border: "1.5px solid var(--border)",
                    background: "var(--muted)",
                    color: "var(--muted-foreground)",
                    fontSize: sizes.initials,
                    fontWeight: 500,
                  }}
                >
                  {change.badge ?? <SongIcon size={sizes.icon} />}
                </span>
                {change.pending === true ? (
                  <span
                    style={{
                      position: "absolute",
                      right: -2,
                      bottom: -2,
                      width: sizes.badge * 0.28,
                      height: sizes.badge * 0.28,
                      borderRadius: "50%",
                      background: "var(--status-scheduled)",
                      boxShadow: "0 0 0 4px white",
                    }}
                  />
                ) : null}
              </span>
              <span style={{ display: "grid", gap: 4, flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: sizes.title,
                    fontWeight: 550,
                    letterSpacing: "-0.02em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {change.title}
                </span>
                <span
                  style={{
                    fontSize: sizes.detail,
                    color: "var(--muted-foreground)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {change.detail}
                </span>
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: sizes.status,
                  fontWeight: saved ? 550 : 450,
                  color: saved
                    ? "var(--status-confirmed)"
                    : "var(--muted-foreground)",
                  whiteSpace: "nowrap",
                }}
              >
                {saved ? <CheckIcon size={sizes.status} /> : null}
                {saved ? "Saved" : "Saving…"}
              </span>
            </div>
            {travel > 0 && travel < 1 ? (
              <div
                style={{
                  position: "absolute",
                  left: dot.x - dotSize / 2,
                  top: dot.y - dotSize / 2,
                  width: dotSize,
                  height: dotSize,
                  borderRadius: "50%",
                  background: "var(--brand)",
                  boxShadow: `0 0 0 ${dotSize / 3}px color-mix(in oklch, var(--brand) 22%, transparent)`,
                  opacity: dotShown,
                  transform: `scale(${mix(0.5, 1, dotShown)})`,
                }}
              />
            ) : null}
          </div>
        );
      })}
      {(() => {
        const shown = pop(frame, 4);
        const arrival = pulse(
          frame,
          changes.map((_, index) => landAt(index)),
          12
        );
        return (
          <div
            style={{
              position: "absolute",
              left: mark.left,
              top: mark.top,
              transform: `scale(${Math.min(shown, 1.2) * (1 + arrival * 0.06)})`,
              opacity: Math.min(1, shown),
            }}
          >
            <ServicesMark size={markSize} />
          </div>
        );
      })()}
    </Scene>
  );
};

/** An end card at least this long (7 beats) gives the URL a beat of lead-in. */
const END_CARD_FULL = 140;

/** Name, line, and where to go. Carries the not-affiliated note Planning Center expects. */
export const EndCard = ({
  duration,
  transition = "soft",
}: {
  duration: number;
  transition?: Transition;
}) => {
  const frame = useCurrentFrame();
  const format = useFormat();
  // The 4:5 feed shares portrait's width, so it takes portrait's type sizes.
  const portrait = format !== "landscape";
  const wordmarkSize = portrait ? 76 : 80;
  // The URL lands on the second beat, or the first when the card is short (the teaser).
  const ctaAt = duration >= END_CARD_FULL ? 40 : 20;
  const lockup = settle(frame, 0, 30);
  const cta = settle(frame, ctaAt, 22);
  const landing = pop(frame, ctaAt);
  const offer = settle(frame, ctaAt + 10, 24);
  const note = settle(frame, ctaAt + 20, 26);

  return (
    <Scene duration={duration} transition={transition}>
      <Center>
        {/* The site header's lockup, as the brand scene sets it. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: wordmarkSize * LOCKUP_GAP_EM,
            opacity: lockup,
            transform: `translateY(${mix(30, 0, lockup)}px)`,
          }}
        >
          <Wordmark size={wordmarkSize} />
          <Rocket
            size={wordmarkSize * ROCKET_EM}
            thrust={0.45}
            drift={(frame / 30) % 1}
          />
        </div>
        <Headline
          lines={["Planning Center, *boosted.*"]}
          size={portrait ? 66 : 72}
          at={8}
          style={{ marginTop: portrait ? 40 : 34 }}
        />
        <span
          style={{
            marginTop: portrait ? 96 : 72,
            fontSize: portrait ? 84 : 76,
            fontWeight: 550,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            color: "var(--primary-foreground)",
            background: "var(--primary)",
            borderRadius: 999,
            padding: portrait ? "34px 64px 38px" : "30px 60px 34px",
            boxShadow: "var(--shadow-frame)",
            opacity: cta,
            transform: `scale(${mix(0.86, 1, landing)})`,
          }}
        >
          pcobooster.com
        </span>
        <span
          style={{
            marginTop: portrait ? 34 : 30,
            fontSize: portrait ? 42 : 38,
            letterSpacing: "-0.01em",
            color: "var(--muted-foreground)",
            opacity: offer,
            transform: `translateY(${mix(16, 0, offer)}px)`,
          }}
        >
          Free during the beta.
        </span>
      </Center>
      <p
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: format === "portrait" ? 1920 - PORTRAIT_SAFE.bottom + 10 : 48,
          margin: 0,
          padding: "0 80px",
          textAlign: "center",
          fontSize: portrait ? 24 : 20,
          lineHeight: 1.5,
          color: "var(--muted-foreground)",
          opacity: note * 0.9,
        }}
      >
        Works with Planning Center Services. Not affiliated with, sponsored by,
        or endorsed by Planning Center. Sample data shown.
      </p>
    </Scene>
  );
};
