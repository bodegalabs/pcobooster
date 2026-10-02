import type { DemoPlanItem } from "./fixtures";

/*
 * A compact version of the product's key-change advice: how rough it is to go
 * from one song's key into the next, and a few things a band could try. The
 * product's rules are richer; these cover the same cases in the same words.
 */

export type TransitionLevel = "smooth" | "worth-a-look" | "rough";

type ChangeKind =
  | "same"
  | "parallel"
  | "relative"
  | "close"
  | "lift"
  | "mediant"
  | "step-down"
  | "half-step-down"
  | "tritone"
  | "distant-mode";

interface MusicalKey {
  readonly pitch: number;
  readonly minor: boolean;
}

const OCTAVE = 12;
const FIFTHS_TO_SEMITONES = 7;
const RELATIVE_MINOR_OFFSET = 3;
const LIFT_LIMIT = 2;
const DISTANT = 3;
const WHOLE_STEP_DOWN = 10;
const HALF_STEP_DOWN = 11;
/** An item this long between two songs gives the band room to change key. */
const BRIDGING_SECONDS = 60;
const MAX_ALTERNATES = 3;

const NOTE_PITCHES = new Map([
  ["C", 0],
  ["D", 2],
  ["E", 4],
  ["F", 5],
  ["G", 7],
  ["A", 9],
  ["B", 11],
]);
const SHARP_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const FLAT_MAJOR_PITCHES = new Set([5, 10, 3, 8, 1, 6]);
const FLAT_MINOR_PITCHES = new Set([2, 7, 0, 5, 10, 3]);
const THIRD_NAMES = new Map([
  [3, "Up a minor third"],
  [4, "Up a major third"],
  [8, "Down a major third"],
  [9, "Down a minor third"],
]);
const KEY_PATTERN = /^(?<letter>[A-G])(?<accidental>[#b]?)(?<minor>m?)$/u;

const wrap = (value: number) => ((value % OCTAVE) + OCTAVE) % OCTAVE;

export const parseKey = (name: string | undefined): MusicalKey | null => {
  const parts = KEY_PATTERN.exec(name ?? "")?.groups;
  const base = NOTE_PITCHES.get(parts?.letter ?? "");
  if (parts === undefined || base === undefined) {
    return null;
  }
  let shift = 0;
  if (parts.accidental === "#") {
    shift = 1;
  } else if (parts.accidental === "b") {
    shift = -1;
  }
  return { pitch: wrap(base + shift), minor: parts.minor === "m" };
};

const usesFlats = (key: MusicalKey) =>
  (key.minor ? FLAT_MINOR_PITCHES : FLAT_MAJOR_PITCHES).has(key.pitch);

/** Spell as the song's own key name does ("F#" stays sharp), else by key signature. */
const prefersFlats = (name: string, key: MusicalKey) => {
  if (name.includes("#")) {
    return false;
  }
  return name.includes("b") || usesFlats(key);
};

const spell = (pitch: number, flats: boolean) =>
  (flats ? FLAT_NAMES : SHARP_NAMES)[wrap(pitch)] ?? "";

const keyName = (key: MusicalKey) =>
  `${spell(key.pitch, usesFlats(key))}${key.minor ? "m" : ""}`;

/** Keys a fifth apart sit next to each other on the circle of fifths. */
const circleDistance = (from: MusicalKey, to: MusicalKey) => {
  const position = (key: MusicalKey) =>
    wrap(
      FIFTHS_TO_SEMITONES *
        (key.minor ? key.pitch + RELATIVE_MINOR_OFFSET : key.pitch)
    );
  const gap = Math.abs(position(from) - position(to));
  return Math.min(gap, OCTAVE - gap);
};

const scalePitches = (key: MusicalKey) =>
  (key.minor ? MINOR_SCALE : MAJOR_SCALE).map((step) => wrap(key.pitch + step));

const sharedPitches = (from: MusicalKey, to: MusicalKey) => {
  const target = new Set(scalePitches(to));
  return scalePitches(from).filter((pitch) => target.has(pitch));
};

interface Rating {
  readonly level: TransitionLevel;
  readonly kind: ChangeKind;
  readonly reason: string;
}

const rateSameMode = (from: MusicalKey, to: MusicalKey, up: number): Rating => {
  if (up <= LIFT_LIMIT) {
    return {
      level: "smooth",
      kind: "lift",
      reason: `Lift up a ${up === 1 ? "half" : "whole"} step`,
    };
  }
  const third = THIRD_NAMES.get(up);
  if (third !== undefined) {
    const shared = sharedPitches(from, to);
    const [only] = shared;
    return {
      level: "worth-a-look",
      kind: "mediant",
      reason:
        shared.length === 1 && only !== undefined
          ? `${third}: shares only ${spell(only, usesFlats(to))}`
          : third,
    };
  }
  if (up === WHOLE_STEP_DOWN) {
    return {
      level: "worth-a-look",
      kind: "step-down",
      reason: "Down a whole step",
    };
  }
  if (up === HALF_STEP_DOWN) {
    return {
      level: "rough",
      kind: "half-step-down",
      reason: "Down a half step: sounds flat without a setup",
    };
  }
  return {
    level: "rough",
    kind: "tritone",
    reason: "Tritone apart: no shared notes",
  };
};

const rateKeyChange = (from: MusicalKey, to: MusicalKey): Rating => {
  const up = wrap(to.pitch - from.pitch);
  const distance = circleDistance(from, to);
  if (up === 0) {
    return from.minor === to.minor
      ? { level: "smooth", kind: "same", reason: "Same key" }
      : {
          level: "smooth",
          kind: "parallel",
          reason: `Parallel key: same tonic, ${to.minor ? "darker" : "brighter"}`,
        };
  }
  if (distance === 0) {
    return {
      level: "smooth",
      kind: "relative",
      reason: "Relative key: same key signature",
    };
  }
  if (distance === 1) {
    return { level: "smooth", kind: "close", reason: "Closely related key" };
  }
  if (from.minor === to.minor) {
    return rateSameMode(from, to, up);
  }
  const effective = Math.min(
    distance,
    circleDistance(from, { ...to, minor: !to.minor }) + 1
  );
  return {
    level: effective >= DISTANT ? "rough" : "worth-a-look",
    kind: "distant-mode",
    reason: "Distant key with a mode change",
  };
};

export interface KeyTransition {
  readonly fromItemId: string;
  readonly toItemId: string;
  readonly from: string;
  readonly to: string;
  readonly fromTitle: string;
  readonly toTitle: string;
  readonly level: TransitionLevel;
  readonly kind: ChangeKind;
  readonly description: string;
  /** A timed item between the songs that covers the change, so it isn't flagged. */
  readonly bridgedBy: string | null;
}

/**
 * Key changes between songs that follow each other within a section. A header
 * starts a new section, and a timed item of a minute or more between two songs
 * covers the change.
 */
export const keyTransitions = (
  items: readonly DemoPlanItem[]
): Map<string, KeyTransition> => {
  const transitions = new Map<string, KeyTransition>();
  let previous: DemoPlanItem | null = null;
  let bridge: DemoPlanItem | null = null;
  for (const item of items) {
    if (item.kind === "header") {
      previous = null;
      bridge = null;
    } else if (item.kind === "item") {
      if (item.seconds >= BRIDGING_SECONDS) {
        bridge = item;
      }
    } else {
      const fromKey = previous === null ? null : parseKey(previous.songKey);
      const toKey = parseKey(item.songKey);
      if (previous !== null && fromKey !== null && toKey !== null) {
        const rating = rateKeyChange(fromKey, toKey);
        transitions.set(item.id, {
          fromItemId: previous.id,
          toItemId: item.id,
          from: previous.songKey ?? keyName(fromKey),
          to: item.songKey ?? keyName(toKey),
          fromTitle: previous.title,
          toTitle: item.title,
          level: bridge === null ? rating.level : "smooth",
          kind: rating.kind,
          description: rating.reason,
          bridgedBy: bridge?.title ?? null,
        });
      }
      previous = item;
      bridge = null;
    }
  }
  return transitions;
};

export type AdviceSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "chord"; readonly text: string };

export interface Suggestion {
  readonly id: string;
  readonly title: string;
  readonly segments: readonly AdviceSegment[];
}

const text = (value: string): AdviceSegment => ({ kind: "text", text: value });
const chord = (value: string): AdviceSegment => ({
  kind: "chord",
  text: value,
});

const COLD_KINDS = new Set<ChangeKind>([
  "half-step-down",
  "tritone",
  "distant-mode",
]);
const HARD_KINDS = new Set<ChangeKind>([
  "mediant",
  "step-down",
  "half-step-down",
  "tritone",
  "distant-mode",
]);

/** Things a band could try; empty when the change needs no help. */
export const suggestionsFor = (transition: KeyTransition): Suggestion[] => {
  const { kind, fromTitle, toTitle, to } = transition;
  if (kind === "lift") {
    return [
      {
        id: "jump",
        title: "Or just go up",
        segments: [
          text(
            `Go straight from ${fromTitle} into ${toTitle}: the jump up is the change.`
          ),
        ],
      },
    ];
  }
  if (!HARD_KINDS.has(kind)) {
    return [];
  }
  const toKey = parseKey(to);
  if (toKey === null) {
    return [];
  }
  const dominant = `${spell(toKey.pitch + FIFTHS_TO_SEMITONES, prefersFlats(to, toKey))}7`;
  const cold = COLD_KINDS.has(kind);
  const suggestions: Suggestion[] = [
    {
      id: "dominant",
      title: cold ? "Stop, then set it up" : "Set up the new key",
      segments: [
        text(
          cold
            ? `Stop fully after ${fromTitle}, then play `
            : `After ${fromTitle}, play `
        ),
        chord(dominant),
        text(` into ${toTitle} in `),
        chord(to),
        text("."),
      ],
    },
    {
      id: "pad",
      title: "Reset under a prayer",
      segments: [
        text(
          `Put a short prayer or reading before ${toTitle}, with a pad moving to `
        ),
        chord(to),
        text("."),
      ],
    },
  ];
  if (kind === "step-down" || kind === "half-step-down") {
    suggestions.push({
      id: "swap",
      title: "Swap them",
      segments: [
        text(
          `Sing ${toTitle} before ${fromTitle}, so the same change becomes a lift up.`
        ),
      ],
    });
  }
  return suggestions;
};

/** A suggestion as one line for an item's notes. */
export const suggestionNote = (suggestion: Suggestion): string =>
  suggestion.segments.map((segment) => segment.text).join("");

/** Notes with `line` added on its own line; unchanged when they already have it. */
export const appendNote = (notes: string, line: string): string => {
  if (notes.includes(line)) {
    return notes;
  }
  return notes.trim() === "" ? line : `${notes.trimEnd()}\n${line}`;
};

const LEVEL_RANK: Readonly<Record<TransitionLevel, number>> = {
  smooth: 0,
  "worth-a-look": 1,
  rough: 2,
};

/** Other keys the song has that would join the previous song more smoothly. */
export const alternateKeys = (
  transition: KeyTransition,
  songKeys: readonly string[]
): string[] => {
  const fromKey = parseKey(transition.from);
  if (fromKey === null) {
    return [];
  }
  const current = LEVEL_RANK[transition.level];
  return songKeys
    .flatMap((name) => {
      const key = parseKey(name);
      if (key === null || name === transition.to) {
        return [];
      }
      const rank = LEVEL_RANK[rateKeyChange(fromKey, key).level];
      return rank < current ? [{ name, rank }] : [];
    })
    .toSorted((a, b) => a.rank - b.rank)
    .slice(0, MAX_ALTERNATES)
    .map((entry) => entry.name);
};
