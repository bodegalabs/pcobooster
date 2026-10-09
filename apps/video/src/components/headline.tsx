import type { CSSProperties } from "react";
import { useCurrentFrame } from "remotion";

import { useFormat } from "../lib/format";
import type { Format } from "../lib/format";
import { mix, progress, settle } from "../lib/motion";

/** Headline lines, or separate line breaks per format where one set won't wrap well. */
export type Lines =
  | readonly string[]
  | Readonly<Record<Format, readonly string[]>>;

/** Words of a line; `*words*` are set in brand green, like the site's `<em>` in headlines. */
const words = (line: string) => {
  let em = false;
  return line
    .split(" ")
    .filter((word) => word !== "")
    .map((raw) => {
      const opens = raw.startsWith("*");
      const closes = raw.endsWith("*") && (raw.length > 1 || !opens);
      const emphasized = em || opens;
      em = emphasized && !closes;
      return { text: raw.replaceAll("*", ""), em: emphasized };
    });
};

interface PlacedWord {
  readonly text: string;
  readonly em: boolean;
  /** Position across every line, which sets when the word rises in. */
  readonly order: number;
}

const placeWords = (lines: readonly string[]) => {
  let order = 0;
  return lines.map((line) => {
    const placed: PlacedWord[] = [];
    for (const word of words(line)) {
      placed.push({ ...word, order });
      order += 1;
    }
    return { line, words: placed };
  });
};

/**
 * Display type in the site's voice (Inter 450, tight tracking). Words rise into focus one
 * after another; doubles as the burned-in caption, so it stays on screen through its beat.
 */
export const Headline = ({
  lines,
  at = 0,
  size,
  align = "center",
  stagger = 3,
  exitAt,
  style,
}: {
  lines: Lines;
  at?: number;
  size: number;
  align?: "center" | "left";
  stagger?: number;
  /** Frame to fade the headline out, when it leaves before its scene does. */
  exitAt?: number;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const format = useFormat();
  const placed = placeWords("landscape" in lines ? lines[format] : lines);
  const leave = exitAt === undefined ? 0 : progress(frame, exitAt, 12);

  return (
    <h1
      style={{
        margin: 0,
        fontSize: size,
        fontWeight: 450,
        lineHeight: 1.06,
        letterSpacing: "-0.045em",
        textAlign: align,
        color: "var(--foreground)",
        opacity: 1 - leave,
        filter: leave > 0 ? `blur(${leave * 10}px)` : undefined,
        ...style,
      }}
    >
      {placed.map(({ line, words: lineWords }) => (
        <span key={line} style={{ display: "block" }}>
          {lineWords.map((word, position) => {
            const shown = settle(frame, at + word.order * stagger, 22);
            return (
              <span key={`${word.text}-${position}`}>
                {position === 0 ? null : " "}
                <span
                  style={{
                    display: "inline-block",
                    color: word.em ? "var(--brand)" : undefined,
                    opacity: shown,
                    transform: `translateY(${mix(0.32, 0, shown)}em)`,
                    filter:
                      shown < 1 ? `blur(${mix(14, 0, shown)}px)` : undefined,
                  }}
                >
                  {word.text}
                </span>
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
};

/** A quieter supporting line under a headline. */
export const Subline = ({
  children,
  at = 0,
  size,
  style,
}: {
  children: string;
  at?: number;
  size: number;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const shown = settle(frame, at, 24);
  return (
    <p
      style={{
        margin: 0,
        fontSize: size,
        lineHeight: 1.45,
        letterSpacing: "-0.01em",
        color: "var(--muted-foreground)",
        textWrap: "balance",
        opacity: shown,
        transform: `translateY(${mix(16, 0, shown)}px)`,
        ...style,
      }}
    >
      {children}
    </p>
  );
};
