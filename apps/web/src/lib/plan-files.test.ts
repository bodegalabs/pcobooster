import type { PlanFile } from "@pcobooster/contracts/plan-files";
import { describe, expect, it } from "vitest";

import { planFileKind, youtubeEmbedUrl } from "@/lib/plan-files";

const file: PlanFile = {
  id: "1",
  name: "Chart",
  filename: "",
  contentType: "",
  fileType: "",
  providerType: "",
  size: 0,
  hasPreview: false,
  downloadable: false,
  streamable: false,
  ownerType: "Plan",
  ownerId: "1",
};
describe("Plan file types", () => {
  it("recognizes generated charts without a MIME type or extension", () => {
    expect(
      planFileKind({ ...file, providerType: "AttachmentChart::Chord" })
    ).toBe("pdf");
    expect(
      planFileKind({ ...file, providerType: "AttachmentChart::Lyric" })
    ).toBe("pdf");
  });

  it("handles uploaded documents, media, and external resources", () => {
    expect(planFileKind({ ...file, filename: "Notes.DOC" })).toBe("document");
    expect(planFileKind({ ...file, filename: "Rehearsal.MP3" })).toBe("audio");
    expect(planFileKind({ ...file, contentType: "image/png" })).toBe("image");
    expect(planFileKind({ ...file, providerType: "YouTube" })).toBe("link");
  });

  it("embeds only validated YouTube IDs on a fixed privacy domain", () => {
    expect(youtubeEmbedUrl("https://youtu.be/abcdefghijk")).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk"
    );
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=abcdefghijk")).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk"
    );
    expect(
      youtubeEmbedUrl("https://youtube.com.evil.example/watch?v=abcdefghijk")
    ).toBeNull();
    expect(youtubeEmbedUrl("https://www.youtube.com/watch?v=bad")).toBeNull();
  });
});
