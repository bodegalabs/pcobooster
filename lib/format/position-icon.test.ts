import { describe, expect, it } from "vitest";

import { resolvePositionIconId } from "@/lib/format/position-icon";

describe(resolvePositionIconId, () => {
  it("maps band positions", () => {
    expect(resolvePositionIconId("Lead Electric Guitar", "Band")).toBe(
      "guitar"
    );
    expect(resolvePositionIconId("Bass Guitar", "Band")).toBe("guitar");
    expect(resolvePositionIconId("Drums", "Band")).toBe("drum");
    expect(resolvePositionIconId("Keys", "Band")).toBe("piano");
    expect(resolvePositionIconId("Pads", "Band")).toBe("piano");
  });

  it("maps percussion and acoustic guitar", () => {
    expect(resolvePositionIconId("Acoustic Guitar", "Band")).toBe("guitar");
    expect(resolvePositionIconId("Percussion", "Band")).toBe("drum");
  });

  it("maps vocal positions", () => {
    expect(resolvePositionIconId("Alto", "Vocals")).toBe("mic-vocal");
    expect(resolvePositionIconId("Male Lead", "Vocals")).toBe("mic-vocal");
    expect(resolvePositionIconId("Soprano", "Vocals")).toBe("mic-vocal");
    expect(resolvePositionIconId("Tenor", "Vocals")).toBe("mic-vocal");
  });

  it("maps audio/visual positions", () => {
    expect(resolvePositionIconId("Camera 1", "Audio/Visual")).toBe("camera");
    expect(resolvePositionIconId("Livestream", "Audio/Visual")).toBe(
      "livestream"
    );
    expect(resolvePositionIconId("Lyrics", "Audio/Visual")).toBe("music-note");
    expect(resolvePositionIconId("Photography", "Audio/Visual")).toBe("camera");
    expect(resolvePositionIconId("Sound", "Audio/Visual")).toBe("sound");
  });

  it("falls back to team category when position name is generic", () => {
    expect(resolvePositionIconId("Team Member", "Band")).toBe("music");
    expect(resolvePositionIconId("Team Member", "Vocals")).toBe("mic-vocal");
    expect(resolvePositionIconId("Team Member", "Audio/Visual")).toBe("camera");
  });

  it("falls back to music-note for unknown labels", () => {
    expect(resolvePositionIconId("Greeter", "Hospitality")).toBe("music-note");
  });
});
