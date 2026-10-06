interface ParsedKey {
  readonly letter: string;
  readonly accidental: "b" | "#" | undefined;
  readonly rest: string;
}

const NOTE_LETTERS = new Set(["A", "B", "C", "D", "E", "F", "G"]);

const parseKey = (key: string): ParsedKey | undefined => {
  const trimmed = key.trim();
  const letter = trimmed.charAt(0);
  if (!NOTE_LETTERS.has(letter)) {
    return undefined;
  }
  const next = trimmed.charAt(1);
  if (next === "b" || next === "#") {
    return { letter, accidental: next, rest: trimmed.slice(2) };
  }
  return { letter, accidental: undefined, rest: trimmed.slice(1) };
};

const FLAT_SIGN = String.fromCodePoint(0x26_6d);
const SHARP_SIGN = String.fromCodePoint(0x26_6f);
const accidentalSigns = { b: FLAT_SIGN, "#": SHARP_SIGN } as const;

/** "Bb" to "B♭", "F#m" to "F♯m". Only the accidental right after the note letter changes. */
export const displayKey = (key: string): string => {
  const parsed = parseKey(key);
  if (parsed === undefined) {
    return key;
  }
  const sign =
    parsed.accidental === undefined ? "" : accidentalSigns[parsed.accidental];
  return `${parsed.letter}${sign}${parsed.rest}`;
};

/** "Bb" to "B flat", "F#m" to "F sharp minor", for VoiceOver. */
export const spokenKey = (key: string): string => {
  const parsed = parseKey(key);
  if (parsed === undefined) {
    return key;
  }
  const words = [parsed.letter];
  if (parsed.accidental === "b") {
    words.push("flat");
  } else if (parsed.accidental === "#") {
    words.push("sharp");
  }
  const rest = parsed.rest.toLowerCase();
  if (rest === "m" || rest.startsWith("min")) {
    words.push("minor");
  } else if (parsed.rest !== "") {
    words.push(parsed.rest);
  }
  return words.join(" ");
};
