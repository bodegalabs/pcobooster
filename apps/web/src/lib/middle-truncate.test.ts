import { describe, expect, it } from "vitest";

import { middleTruncate } from "@/lib/middle-truncate";

/** Monospace stand-in for Pretext: every character is 10px wide. */
const measure = (text: string): number => text.length * 10;

describe(middleTruncate, () => {
  it("leaves text that fits unchanged", () => {
    expect(middleTruncate("Camera 1 Left AM", 200, measure)).toBe(
      "Camera 1 Left AM"
    );
  });

  it("keeps the distinguishing last word", () => {
    expect(middleTruncate("Camera 2 Middle PM", 140, measure)).toBe(
      "Camera 2 M… PM"
    );
  });

  it("keeps several trailing words when they fit in half the width", () => {
    expect(middleTruncate("Rehearsal for PM service", 230, measure)).toBe(
      "Rehearsal f… PM service"
    );
  });

  it("prefers the ending that leaves more whole words", () => {
    // "Camera 3 Righ… AM" and "Camera… Right AM" both show 3 whole words and
    // 14 characters, so the longer ending wins the tie.
    expect(middleTruncate("Camera 3 Right AM", 160, measure)).toBe(
      "Camera… Right AM"
    );
    expect(middleTruncate("Camera 3 Right AM", 150, measure)).toBe(
      "Camera 3 Ri… AM"
    );
  });

  it("falls back to trailing graphemes for a single long word", () => {
    expect(middleTruncate("Supercalifragilistic", 100, measure)).toBe(
      "Supe…istic"
    );
  });

  it("trims the space before the ellipsis when the next word cannot fit", () => {
    expect(middleTruncate("Camera 2 Middle PM", 120, measure)).toBe(
      "Camera 2… PM"
    );
  });

  it("never exceeds the available width", () => {
    const text = "Communion || Worship Choir AM";
    for (let width = 30; width <= 300; width += 10) {
      expect(measure(middleTruncate(text, width, measure))).toBeLessThanOrEqual(
        Math.max(width, measure("… AM"))
      );
    }
  });

  it("returns the text when there is no width to measure yet", () => {
    expect(middleTruncate("Livestream PM", 0, measure)).toBe("Livestream PM");
  });
});
