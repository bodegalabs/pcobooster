import { describe, expect, it } from "vitest";

import { initials } from "./people";
import { displayKey, spokenKey } from "./song-keys";

describe(initials, () => {
  it("takes the first letters of the first two words", () => {
    expect(initials("Jordan Hale")).toBe("JH");
    expect(initials("  riley   brooks smith ")).toBe("RB");
  });

  it("takes two letters of a single word, and a question mark for none", () => {
    expect(initials("Quinn")).toBe("QU");
    expect(initials("   ")).toBe("?");
  });
});

describe(displayKey, () => {
  it("renders true flat and sharp signs after the note letter only", () => {
    expect(displayKey("Bb")).toBe(`B${String.fromCodePoint(0x26_6d)}`);
    expect(displayKey("F#m")).toBe(`F${String.fromCodePoint(0x26_6f)}m`);
    expect(displayKey("Ebm")).toBe(`E${String.fromCodePoint(0x26_6d)}m`);
    expect(displayKey("G")).toBe("G");
  });

  it("leaves anything that is not a key alone", () => {
    expect(displayKey("bb")).toBe("bb");
  });
});

describe(spokenKey, () => {
  it("speaks accidentals and minor keys", () => {
    expect(spokenKey("Bb")).toBe("B flat");
    expect(spokenKey("F#m")).toBe("F sharp minor");
    expect(spokenKey("A")).toBe("A");
    expect(spokenKey("Csus")).toBe("C sus");
  });
});
