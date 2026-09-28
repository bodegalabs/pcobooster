import { describe, expect, it } from "vitest";

import { parseMusicalKey } from "@/lib/key-theory";
import type { MusicalKey } from "@/lib/key-theory";
import {
  rankAlternateKeys,
  rateKeyChange,
  transitionSuggestions,
} from "@/lib/key-transition-advice";

const key = (value: string): MusicalKey => {
  const parsed = parseMusicalKey(value);
  if (parsed === null) {
    throw new Error(`Not a key: ${value}`);
  }
  return parsed;
};

const rate = (from: string, to: string) => {
  const { level, reason } = rateKeyChange(key(from), key(to));
  return `${level}: ${reason}`;
};

const advice = (from: string, to: string) => {
  const fromKey = key(from);
  const toKey = key(to);
  return transitionSuggestions(
    { fromTitle: "A", toTitle: "B", fromKey, toKey },
    rateKeyChange(fromKey, toKey).kind
  ).map((suggestion) =>
    suggestion.segments.map((segment) => segment.text).join("")
  );
};

describe(rateKeyChange, () => {
  it("leaves same, parallel, relative, close, and lifting keys alone", () => {
    expect(rate("C", "C")).toBe("smooth: Same key");
    expect(rate("Am", "A")).toBe("smooth: Parallel key: same tonic, brighter");
    expect(rate("C", "Am")).toBe("smooth: Relative key: same key signature");
    expect(rate("Am", "G")).toBe("smooth: Closely related key");
    expect(rate("C", "D")).toBe("smooth: Lift up a whole step");
  });

  it("asks for a look at thirds and a whole step down", () => {
    expect(rate("C", "Eb")).toBe(
      "worth-a-look: Up a minor third: shares only G"
    );
    expect(rate("C", "E")).toBe(
      "worth-a-look: Up a major third: shares only E"
    );
    expect(rate("C", "Bb")).toBe("worth-a-look: Down a whole step");
    expect(rate("C", "Fm")).toBe(
      "worth-a-look: Distant key with a mode change"
    );
  });

  it("calls tritones, half steps down, and distant mode changes rough", () => {
    expect(rate("Bb", "E")).toBe("rough: Tritone apart: no shared notes");
    expect(rate("Eb", "D")).toBe(
      "rough: Down a half step: sounds flat without a setup"
    );
    expect(rate("C", "F#m")).toBe("rough: Distant key with a mode change");
  });
});

describe(transitionSuggestions, () => {
  it("leads with a chord both keys share", () => {
    expect(advice("Am", "E")[0]).toBe(
      "End A on E (it's already a chord in Am), then start B right there."
    );
    expect(advice("D", "C")[0]).toBe(
      "End A on G (already a chord in D), make it G7, then start B in C."
    );
  });

  it("slides to a relative chord when no chord is shared", () => {
    expect(advice("D", "Gm")).toContain(
      "End A on Bm, move to its relative D, make it D7, then start B in Gm."
    );
  });

  it("holds a note from the last chord into the next song's opening chord", () => {
    expect(advice("F", "D")[0]).toBe(
      "End A on F, but hold the A (its third). It becomes the fifth of B's opening D chord."
    );
    expect(advice("C", "Eb")).toStrictEqual([
      "End A on C, but hold the G (its fifth). It becomes the third of B's opening Eb chord.",
      "End A on Fm (borrowed from Cm; the ii of Eb), then Bb7 into B.",
      "After A, play Bb7 into B in Eb.",
      "Put a short prayer or reading before B, with a pad moving to Eb.",
    ]);
  });

  it("names a held note as the band plays it, then as the new key writes it", () => {
    expect(advice("Ab", "E")[0]).toBe(
      "End A on Ab, but hold the Ab (its root). As G#, it becomes the third of B's opening E chord."
    );
  });

  it("changes the chords to end on and open with when the home chords share nothing", () => {
    expect(advice("Bb", "E")).toStrictEqual([
      "End A on F (its V) instead of Bb, but hold the A (its third). It becomes the third of F#m: open B on F#m (its ii), then B7 to land in E.",
      "Put a short prayer or reading before B, with a pad moving to E.",
      "Stop fully after A, then play B7 into B in E.",
    ]);
  });

  it("ends on the new V when the first key already has it", () => {
    expect(advice("C", "Bb")).toContain(
      "End A on F (already a chord in C), make it F7, then start B in Bb."
    );
  });

  it("offers nothing when the change is smooth", () => {
    expect(advice("G", "D")).toStrictEqual([]);
  });
});

describe(rankAlternateKeys, () => {
  it("keeps nearby keys that come in smoothly, smallest move then lower first", () => {
    const candidates = ["F", "Eb", "D", "C", "Ab"].map((name) => ({
      key: key(name),
      value: name,
    }));

    expect(
      rankAlternateKeys({ fromKey: key("Bb"), toKey: key("E") }, candidates)
    ).toStrictEqual(["Eb", "F"]);
    expect(
      rankAlternateKeys({ fromKey: key("C"), toKey: key("Eb") }, candidates)
    ).toStrictEqual(["D", "F"]);
  });
});
