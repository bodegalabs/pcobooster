/**
 * Key and chord spelling for set flow suggestions. Every name is spelled from the key's
 * own scale, one letter per degree, so the dominant of Db is Ab7 (never G#7) and the
 * third of F# major is A# (never Bb).
 */

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
type Letter = (typeof LETTERS)[number];
const LETTER_PITCHES = new Map<Letter, number>([
  ["C", 0],
  ["D", 2],
  ["E", 4],
  ["F", 5],
  ["G", 7],
  ["A", 9],
  ["B", 11],
]);
const OCTAVE = 12;
const FIFTH_DEGREE = 4;
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
const NATURAL_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;
const KEY_PATTERN =
  /^\s*(?<letter>[A-G])(?<accidental>[#♯b♭]?)(?<minor>m(?!aj)|min)?/u;

const THEORETICAL_MAJOR_RESPELLINGS = new Map<Letter, Letter>([
  ["A", "B"],
  ["D", "E"],
  ["G", "A"],
]);

const mod12 = (value: number) => ((value % OCTAVE) + OCTAVE) % OCTAVE;

const isLetter = (value: string): value is Letter =>
  LETTERS.some((letter) => letter === value);

export interface MusicalKey {
  letter: Letter;
  /** -1 flat, 0 natural, 1 sharp. */
  accidental: number;
  minor: boolean;
}

const accidentalText = (accidental: number): string => {
  if (accidental > 0) {
    return "#".repeat(accidental);
  }
  return "b".repeat(-accidental);
};

export const pitchOf = ({
  letter,
  accidental,
}: Pick<MusicalKey, "letter" | "accidental">) =>
  mod12((LETTER_PITCHES.get(letter) ?? 0) + accidental);

export const noteName = ({
  letter,
  accidental,
}: Pick<MusicalKey, "letter" | "accidental">) =>
  `${letter}${accidentalText(accidental)}`;

export const keyName = (key: MusicalKey) =>
  `${noteName(key)}${key.minor ? "m" : ""}`;

/** Reads "Eb", "F#m", "Bbmin", or "C" from a Planning Center key field. */
export const parseMusicalKey = (
  value: string | null | undefined,
  minorOverride?: boolean | null
): MusicalKey | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const match = KEY_PATTERN.exec(value);
  const letter = match?.groups?.letter ?? "";
  if (match === null || !isLetter(letter)) {
    return null;
  }
  const accidentalMark = match.groups?.accidental ?? "";
  let accidental = 0;
  if (accidentalMark === "#" || accidentalMark === "♯") {
    accidental = 1;
  } else if (accidentalMark === "b" || accidentalMark === "♭") {
    accidental = -1;
  }
  const minor = minorOverride ?? match.groups?.minor !== undefined;
  // Planning Center allows A#, D#, and G# major, which no band reads; use their flat names.
  const respelled =
    !minor && accidental === 1
      ? THEORETICAL_MAJOR_RESPELLINGS.get(letter)
      : undefined;
  return respelled === undefined
    ? { letter, accidental, minor }
    : { letter: respelled, accidental: -1, minor };
};

/** The same tonic in the other mode: C and Cm, Am and A. */
export const parallelOf = (key: MusicalKey): MusicalKey => ({
  ...key,
  minor: !key.minor,
});

export interface SpelledNote {
  letter: Letter;
  accidental: number;
  pitch: number;
}

/** The seven scale degrees of a key, each on its own letter. */
export const scaleOf = (key: MusicalKey): SpelledNote[] => {
  const tonicPitch = pitchOf(key);
  const tonicIndex = LETTERS.indexOf(key.letter);
  const steps = key.minor ? NATURAL_MINOR_STEPS : MAJOR_STEPS;
  return steps.map((step, degree) => {
    const letter = LETTERS[(tonicIndex + degree) % LETTERS.length] ?? "C";
    const pitch = mod12(tonicPitch + step);
    let accidental = mod12(pitch - (LETTER_PITCHES.get(letter) ?? 0));
    if (accidental > OCTAVE / 2) {
      accidental -= OCTAVE;
    }
    return { letter, accidental, pitch };
  });
};

export type ChordQuality = "" | "m" | "dim" | "7";

export interface Chord {
  root: SpelledNote;
  quality: ChordQuality;
  /** Roman numeral within the key it was spelled in, such as "V7" or "vi". */
  numeral: string;
}

export const chordName = (chord: Chord) =>
  `${noteName(chord.root)}${chord.quality}`;

const MAJOR_QUALITIES: readonly ChordQuality[] = [
  "",
  "m",
  "m",
  "",
  "",
  "m",
  "dim",
];
const MINOR_QUALITIES: readonly ChordQuality[] = [
  "m",
  "dim",
  "",
  "m",
  "m",
  "",
  "",
];
const MAJOR_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_NUMERALS = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

/**
 * The key's diatonic triads, spelled from its scale. Minor keys also get the major V
 * their raised seventh makes, which is how bands actually play the dominant in minor.
 */
export const diatonicTriads = (key: MusicalKey): Chord[] => {
  const scale = scaleOf(key);
  const triads: Chord[] = scale.map((root, degree) => ({
    root,
    quality: (key.minor ? MINOR_QUALITIES : MAJOR_QUALITIES)[degree] ?? "",
    numeral: (key.minor ? MINOR_NUMERALS : MAJOR_NUMERALS)[degree] ?? "",
  }));
  const fifth = scale.at(FIFTH_DEGREE);
  if (key.minor && fifth !== undefined) {
    triads.push({ root: fifth, quality: "", numeral: "V" });
  }
  return triads;
};

/** The chord that sets up the dominant: ii in a major key (Em in D), iv in minor (Dm in Am). */
export const predominantOf = (key: MusicalKey): Chord => {
  const [, second, , fourth] = scaleOf(key);
  const root = (key.minor ? fourth : second) ?? {
    letter: key.letter,
    accidental: key.accidental,
    pitch: pitchOf(key),
  };
  return { root, quality: "m", numeral: key.minor ? "iv" : "ii" };
};

/** The dominant seventh that leads into a key: A7 into D, Ab7 into Db, E7 into Am. */
export const dominantSeventhOf = (key: MusicalKey): Chord => {
  const fifth = scaleOf(key).at(FIFTH_DEGREE);
  return {
    root: fifth ?? {
      letter: key.letter,
      accidental: key.accidental,
      pitch: pitchOf(key),
    },
    quality: "7",
    numeral: "V7",
  };
};

const chordPitches = (chord: Chord): number[] => {
  const root = chord.root.pitch;
  if (chord.quality === "m") {
    return [root, mod12(root + 3), mod12(root + 7)];
  }
  if (chord.quality === "dim") {
    return [root, mod12(root + 3), mod12(root + 6)];
  }
  return [root, mod12(root + 4), mod12(root + 7)];
};

/** Where a shared chord sits in the new key, best setup first (Hutchinson 22.4). */
const MAJOR_PIVOT_NUMERALS = ["ii", "IV", "vi", "iii"];
const MINOR_PIVOT_NUMERALS = ["iv", "VI", "III", "VII", "v"];

export interface PivotChord {
  chord: Chord;
  /** Borrowed from the first key's parallel minor rather than found in the key itself. */
  borrowed: boolean;
}

const sharedTriads = (from: readonly Chord[], to: MusicalKey): Chord[] => {
  const allowed = to.minor ? MINOR_PIVOT_NUMERALS : MAJOR_PIVOT_NUMERALS;
  const allowedSet = new Set(allowed);
  return diatonicTriads(to)
    .filter(
      (chord) =>
        allowedSet.has(chord.numeral) &&
        from.some(
          (candidate) =>
            candidate.root.pitch === chord.root.pitch &&
            candidate.quality === chord.quality
        )
    )
    .toSorted(
      (a, b) => allowed.indexOf(a.numeral) - allowed.indexOf(b.numeral)
    );
};

/**
 * Chords in both keys that set up the new one, spelled and numbered in the new key. The
 * new key's I is the arrival and its V is its own suggestion, so neither is listed. When
 * a major first key shares nothing, its parallel minor's chords are tried as borrowed ones.
 */
export const pivotChords = (from: MusicalKey, to: MusicalKey): PivotChord[] => {
  const direct = sharedTriads(diatonicTriads(from), to);
  if (direct.length > 0 || from.minor) {
    return direct.map((chord) => ({ chord, borrowed: false }));
  }
  return sharedTriads(diatonicTriads(parallelOf(from)), to).map((chord) => ({
    chord,
    borrowed: true,
  }));
};

/** Whether the new key's V chord is already a chord of the first key (F in C, into Bb). */
export const dominantIsIn = (from: MusicalKey, to: MusicalKey): boolean => {
  const fifth = scaleOf(to).at(FIFTH_DEGREE);
  return (
    fifth !== undefined &&
    diatonicTriads(from).some(
      (chord) => chord.quality === "" && chord.root.pitch === fifth.pitch
    )
  );
};

const tonicTriad = (key: MusicalKey): Chord =>
  diatonicTriads(key)[0] ?? {
    root: {
      letter: key.letter,
      accidental: key.accidental,
      pitch: pitchOf(key),
    },
    quality: key.minor ? "m" : "",
    numeral: key.minor ? "i" : "I",
  };

/** Notes both home chords share, spelled in the new key, for a held note or pad. */
export const commonTones = (
  from: MusicalKey,
  to: MusicalKey
): SpelledNote[] => {
  const fromPitches = new Set(chordPitches(tonicTriad(from)));
  const toPitches = new Set(chordPitches(tonicTriad(to)));
  return scaleOf(to).filter(
    (note) => fromPitches.has(note.pitch) && toPitches.has(note.pitch)
  );
};

/** Semitones up from one key's tonic to another's, 0 to 11. */
export const semitonesUp = (from: MusicalKey, to: MusicalKey) =>
  mod12(pitchOf(to) - pitchOf(from));

/** Steps apart on the circle of fifths, 0 to 6, comparing each key's major signature. */
export const circleOfFifthsDistance = (a: MusicalKey, b: MusicalKey) => {
  const signaturePitch = (key: MusicalKey) =>
    mod12(pitchOf(key) + (key.minor ? 3 : 0));
  const fifths = mod12((signaturePitch(b) - signaturePitch(a)) * 7);
  return Math.min(fifths, OCTAVE - fifths);
};
