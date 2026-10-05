import type { PlanFile } from "@pcobooster/contracts/plan-files";
import type { PlanItem } from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

import {
  formatFileSize,
  groupPlanFiles,
  planFileKind,
  youtubeEmbedUrl,
} from "@/lib/plan-files";

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

const planItem = (id: string, title: string, songId: string): PlanItem => ({
  id,
  title,
  itemType: "song",
  sequence: Number(id),
  servicePosition: "during",
  length: null,
  description: "",
  htmlDetails: "",
  customArrangementSequence: [],
  song: { id: songId, title, author: "", themes: "", lastScheduledAt: null },
  arrangement: null,
  key: null,
  layout: null,
});

describe("Plan file groups", () => {
  it("lists plan-wide files first, then items in service order", () => {
    const items = [
      planItem("1", "Opener", "s1"),
      planItem("2", "Closer", "s2"),
    ];
    const groups = groupPlanFiles(
      [
        { ...file, id: "a", ownerType: "Song", ownerId: "s2" },
        { ...file, id: "b", ownerType: "Item", ownerId: "1" },
        { ...file, id: "c" },
      ],
      items
    );
    expect(groups.map((group) => group.label)).toStrictEqual([
      "Plan files",
      "Opener",
      "Closer",
    ]);
    expect(
      groups.map((group) => group.files.map(({ id }) => id))
    ).toStrictEqual([["c"], ["b"], ["a"]]);
  });

  it("leaves out empty groups", () => {
    expect(
      groupPlanFiles(
        [{ ...file, ownerType: "Item", ownerId: "1" }],
        [planItem("1", "Opener", "s1")]
      ).map((group) => group.label)
    ).toStrictEqual(["Opener"]);
  });
});

describe("File sizes", () => {
  it("labels sizes and omits unknown ones", () => {
    expect(formatFileSize(0)).toBeNull();
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2_516_582)).toBe("2.4 MB");
    expect(formatFileSize(48_000_000)).toBe("46 MB");
  });
});
