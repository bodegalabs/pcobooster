import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { Rocket, ServicesMark, Wordmark } from "../components/brand";
import { Headline, Subline } from "../components/headline";
import type { Lines } from "../components/headline";
import { Scene } from "../components/scene";
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
        border: "2px dashed var(--status-declined)",
        color: "var(--status-declined)",
      }}
    >
      <UserPlusIcon size={20 * scale} />
    </span>
    <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
      {position}
    </span>
    <span style={{ color: "var(--status-declined)", fontWeight: 500 }}>
      Open
    </span>
  </div>
);

const OPEN_CHIPS = [
  { position: "Acoustic Guitar", landscape: [0.17, 0.2], portrait: [0.3, 0.2] },
  { position: "Drums", landscape: [0.83, 0.16], portrait: [0.74, 0.26] },
  { position: "Sound", landscape: [0.12, 0.78], portrait: [0.26, 0.66] },
  { position: "Tenor", landscape: [0.86, 0.74], portrait: [0.76, 0.72] },
  { position: "Greeter", landscape: [0.5, 0.88], portrait: [0.5, 0.78] },
] as const;

/** The problem, in the leader's words, with Sunday's open slots floating around it. */
export const HookScene = ({
  duration,
  lines,
}: {
  duration: number;
  lines: Lines;
}) => {
  const frame = useCurrentFrame();
  const format = useFormat();
  const { width, height } = useVideoConfig();
  const size = useStatementSize();
  const chipScale = format === "portrait" ? 1.05 : 1.15;

  return (
    <Scene duration={duration}>
      {OPEN_CHIPS.map((chip, index) => {
        const [x, y] = chip[format];
        const shown = pop(frame, 4 + index * 5);
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
      <Center style={{ padding: "0 60px" }}>
        <Headline lines={lines} size={size} at={8} stagger={4} />
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

/** The rocket flies in and the name lands: "Planning Center, boosted." */
export const BrandScene = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const portrait = useFormat() === "portrait";
  const flight = progress(frame, 0, 34, easeOut);
  const rocketSize = portrait ? 220 : 190;
  const thrust = mix(1, 0.35, progress(frame, 18, 30));
  const wordmark = settle(frame, 22, 26);

  return (
    <Scene duration={duration}>
      <Center>
        <div
          style={{
            display: "flex",
            flexDirection: portrait ? "column" : "row",
            alignItems: "center",
            gap: portrait ? 40 : 44,
          }}
        >
          <div
            style={{
              transform: `translate(${mix(-520, 0, flight)}px, ${mix(420, 0, flight)}px) rotate(${mix(-8, 0, flight)}deg)`,
            }}
          >
            <Rocket
              size={rocketSize}
              thrust={thrust}
              drift={(frame / 30) % 1}
            />
          </div>
          <div
            style={{
              opacity: wordmark,
              transform: `translateX(${mix(portrait ? 0 : -30, 0, wordmark)}px) translateY(${mix(portrait ? 24 : 0, 0, wordmark)}px)`,
              filter:
                wordmark < 1 ? `blur(${mix(12, 0, wordmark)}px)` : undefined,
            }}
          >
            <Wordmark size={portrait ? 120 : 132} />
          </div>
        </div>
        <Headline
          lines={["Planning Center, *boosted.*"]}
          size={portrait ? 76 : 72}
          at={44}
          style={{ marginTop: portrait ? 96 : 72 }}
        />
        <Subline
          at={60}
          size={portrait ? 36 : 32}
          style={{ marginTop: 26, maxWidth: portrait ? 820 : 980 }}
        >
          The workspace ministry leaders open every week, on top of the Services
          you already use.
        </Subline>
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
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const CHANGES = [
  {
    badge: "HC",
    title: "Hayden Collins",
    detail: "Acoustic Guitar, requested",
  },
  { badge: null, title: "Steady Ground", detail: "Key changed to D" },
  { badge: null, title: "Morning Light", detail: "Chords transposed to A" },
] as const;

/** The changes from the earlier scenes, each saving back to Planning Center Services. */
export const SavesBackScene = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const portrait = useFormat() === "portrait";
  const rowWidth = portrait ? 900 : 860;
  const markSize = portrait ? 140 : 150;
  // Row column and mark positions, with the mark's clear space kept empty.
  const rows = portrait ? { left: 90, top: 760 } : { left: 230, top: 410 };
  const mark = portrait
    ? { left: 540 - markSize / 2, top: 1250 }
    : { left: 1500, top: 540 - markSize / 2 };
  const rowHeight = portrait ? 132 : 128;
  const rowGap = 22;

  return (
    <Scene duration={duration}>
      <div
        style={{
          position: "absolute",
          top: portrait ? PORTRAIT_SAFE.top + 10 : 80,
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
          at={2}
          style={{ maxWidth: portrait ? 960 : 1600 }}
        />
      </div>
      {CHANGES.map((change, index) => {
        const appear = settle(frame, 14 + index * 12, 24);
        const travelStart = 28 + index * 12;
        const travel = progress(frame, travelStart, 22, easeInOut);
        const saved = frame >= travelStart + 22;
        const top = rows.top + index * (rowHeight + rowGap);
        const fromX = rows.left + rowWidth;
        const fromY = top + rowHeight / 2;
        const toX = mark.left + markSize / 2;
        const toY = mark.top + markSize / 2;
        const dotX = mix(fromX, toX, travel);
        const dotY = mix(fromY, toY, travel) - Math.sin(travel * Math.PI) * 60;
        return (
          <div key={change.title}>
            <div
              style={{
                position: "absolute",
                left: rows.left,
                top,
                width: rowWidth,
                height: rowHeight,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                gap: 24,
                padding: "0 32px",
                background: "white",
                borderRadius: 24,
                boxShadow: "var(--shadow-frame)",
                opacity: appear,
                transform: `translateX(${mix(-40, 0, appear)}px)`,
              }}
            >
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: "var(--secondary)",
                  color: "var(--muted-foreground)",
                  fontSize: 22,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {change.badge ?? <SongIcon size={26} />}
              </span>
              <span style={{ display: "grid", gap: 4, flex: 1 }}>
                <span
                  style={{
                    fontSize: 30,
                    fontWeight: 550,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {change.title}
                </span>
                <span
                  style={{ fontSize: 24, color: "var(--muted-foreground)" }}
                >
                  {change.detail}
                </span>
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 22,
                  color: saved
                    ? "var(--status-confirmed)"
                    : "var(--muted-foreground)",
                  whiteSpace: "nowrap",
                }}
              >
                {saved ? <CheckIcon size={22} /> : null}
                {saved ? "Saved" : "Saving…"}
              </span>
            </div>
            {travel > 0 && travel < 1 ? (
              <div
                style={{
                  position: "absolute",
                  left: dotX - 9,
                  top: dotY - 9,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--brand)",
                  boxShadow:
                    "0 0 0 6px color-mix(in oklch, var(--brand) 22%, transparent)",
                }}
              />
            ) : null}
          </div>
        );
      })}
      {(() => {
        const shown = pop(frame, 8);
        const arrival = pulse(
          frame,
          CHANGES.map((_, index) => 28 + index * 12 + 22),
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

/** Name, line, and where to go. Carries the not-affiliated note Planning Center expects. */
export const EndCard = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const portrait = useFormat() === "portrait";
  const rocket = settle(frame, 0, 30);
  const cta = settle(frame, 30, 26);
  const note = settle(frame, 44, 26);

  return (
    <Scene duration={duration}>
      <Center>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 32,
            opacity: rocket,
            transform: `translateY(${mix(30, 0, rocket)}px)`,
          }}
        >
          <Rocket
            size={portrait ? 120 : 112}
            thrust={0.45}
            drift={(frame / 30) % 1}
          />
          <Wordmark size={portrait ? 92 : 88} />
        </div>
        <Headline
          lines={["Planning Center, *boosted.*"]}
          size={portrait ? 84 : 96}
          at={10}
          style={{ marginTop: portrait ? 64 : 54 }}
        />
        <div
          style={{
            marginTop: portrait ? 72 : 60,
            display: "flex",
            flexDirection: portrait ? "column" : "row",
            alignItems: "center",
            gap: portrait ? 22 : 28,
            opacity: cta,
            transform: `translateY(${mix(24, 0, cta)}px)`,
          }}
        >
          <span
            style={{
              fontSize: portrait ? 38 : 34,
              color: "var(--muted-foreground)",
            }}
          >
            The beta is open.
          </span>
          <span
            style={{
              fontSize: portrait ? 44 : 38,
              fontWeight: 550,
              letterSpacing: "-0.02em",
              color: "var(--primary-foreground)",
              background: "var(--primary)",
              borderRadius: 999,
              padding: portrait ? "22px 44px" : "18px 40px",
            }}
          >
            pcobooster.com
          </span>
        </div>
      </Center>
      <p
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: portrait ? 1920 - PORTRAIT_SAFE.bottom + 10 : 48,
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
