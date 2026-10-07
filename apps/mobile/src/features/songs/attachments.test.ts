import { makeProductClient } from "@pcobooster/client/product-client";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { Forbidden } from "@pcobooster/contracts/faults/forbidden";
import { songAttachmentsSchema } from "@pcobooster/contracts/http/songs";
import { QueryClient, QueryObserver, dehydrate } from "@tanstack/react-query";
import { Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import { serializeQueryCache } from "../../app-shell/query-persistence";
import { fixturePreviewFiles } from "../../harness/fixture-preview-files";
import attachmentsFixture from "../../harness/fixtures/songs.attachments.json";
import { makeControlledFixture } from "../../harness/testing/controlled-fixture";
import {
  MAX_PREVIEW_BYTES,
  attachmentDetail,
  attachmentFileType,
  attachmentPreview,
  formatFileSize,
  groupAttachments,
} from "./attachments";
import type { SongAttachment } from "./attachments";
import { attachmentReads, songFileHref, songFilesHref } from "./preview-reads";
import { PreviewError } from "./previews";
import type { PreviewFiles } from "./previews";

const fixtureAttachments = Schema.decodeUnknownSync(songAttachmentsSchema)(
  attachmentsFixture.cases[0]?.output
).attachments;

const byId = (id: string): SongAttachment => {
  const found = fixtureAttachments.find((attachment) => attachment.id === id);
  if (found === undefined) {
    throw new Error(`No fixture attachment ${id}`);
  }
  return found;
};

const file = (overrides: Partial<SongAttachment>): SongAttachment => ({
  id: "1",
  keyId: null,
  name: "File",
  filename: "file.pdf",
  kind: "pdf",
  contentType: "application/pdf",
  fileSize: 1000,
  linkUrl: null,
  downloadable: true,
  streamable: false,
  ...overrides,
});

describe(attachmentPreview, () => {
  it("previews every fixture file the way its kind and permissions allow", () => {
    expect(
      fixtureAttachments.map((attachment) => [
        attachment.id,
        attachmentPreview(attachment),
      ])
    ).toStrictEqual([
      ["88001", { kind: "media", video: false }],
      ["88002", { kind: "media", video: true }],
      [
        "88003",
        {
          kind: "link",
          url: "https://www.youtube.com/watch?v=fixture-morning-light",
        },
      ],
      ["88004", { kind: "document", printable: true }],
      ["88006", { kind: "unavailable", reason: "too-large" }],
      ["88007", { kind: "unavailable", reason: "not-downloadable" }],
      ["88005", { kind: "document", printable: true }],
    ]);
  });

  it("never opens a link that is not https", () => {
    expect(
      attachmentPreview(file({ kind: "link", linkUrl: "http://example.com/a" }))
    ).toStrictEqual({ kind: "unavailable", reason: "insecure-link" });
  });

  it("offers a document without a preview type for sharing, and refuses one past the size limit", () => {
    expect(
      [
        file({ kind: "other", filename: "stems.zip" }),
        file({ kind: "document", fileSize: MAX_PREVIEW_BYTES + 1 }),
        file({ kind: "document", fileSize: null }),
      ].map(attachmentPreview)
    ).toStrictEqual([
      { kind: "share-only" },
      { kind: "unavailable", reason: "too-large" },
      { kind: "document", printable: false },
    ]);
  });

  it("streams media Planning Center streams even when it won't release the file", () => {
    expect(
      attachmentPreview(
        file({ kind: "audio", downloadable: false, streamable: true })
      )
    ).toStrictEqual({ kind: "media", video: false });
  });
});

describe("attachment labels", () => {
  it("describes a file by kind and size, and a link by its site", () => {
    expect(
      [byId("88001"), byId("88003"), byId("88004")].map(attachmentDetail)
    ).toStrictEqual([
      "Audio · 4 MB",
      "Link · youtube.com",
      "Image · 378 bytes",
    ]);
  });

  it.each([
    [999, "999 bytes"],
    [52_000, "51 KB"],
    [4_200_000, "4 MB"],
    [1_500_000, "1.4 MB"],
    [3 * 1024 ** 3, "3 GB"],
  ])("formats %d bytes as %s", (bytes, label) => {
    expect(formatFileSize(bytes)).toBe(label);
  });

  it("tells Share what a downloaded file is", () => {
    expect(
      [byId("88005"), byId("88004"), byId("88006")].map(attachmentFileType)
    ).toStrictEqual([
      { mimeType: "application/pdf", uti: "com.adobe.pdf" },
      { mimeType: "image/png", uti: "public.png" },
      { mimeType: "application/zip", uti: null },
    ]);
  });

  it("groups the arrangement's files first, then each key's in key order", () => {
    const keys = [
      { id: "550111", name: "Original", startingKey: "G", endingKey: null },
      { id: "550112", name: "Jordan's key", startingKey: "A", endingKey: null },
    ];
    expect(
      groupAttachments(fixtureAttachments, keys).map((group) => [
        group.title,
        group.attachments.map(({ id }) => id),
      ])
    ).toStrictEqual([
      ["Arrangement", ["88001", "88002", "88003", "88004", "88006"]],
      ["Key: Original (G)", ["88007"]],
      ["Key: Jordan's key (A)", ["88005"]],
    ]);
  });

  it("links to the files screen and one file with its key", () => {
    expect([
      songFilesHref("5501", "55011"),
      songFileHref("5501", "55011", { id: "88005", keyId: "550112" }),
      songFileHref("5501", "55011", { id: "88001", keyId: null }),
    ]).toStrictEqual([
      "/songs/5501/files?arrangement=55011",
      "/songs/5501/files/88005?arrangement=55011&key=550112",
      "/songs/5501/files/88001?arrangement=55011",
    ]);
  });
});

const setup = (scope = "account-a") => {
  const { transport, fetch: fixtureFetch } = makeControlledFixture();
  const requests: Request[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    requests.push(new Request(input, init));
    return await fixtureFetch(input, init);
  });
  const client = makeProductClient({
    url: "https://fixtures.invalid",
    client: "expo",
    credentials: "omit",
    fetch,
  });
  const downloads: { scope: string; url: string; signal: AbortSignal }[] = [];
  const device: PreviewFiles = {
    writeBase64: (writeScope, folder, name) =>
      `file:///cache/${writeScope}/${folder}/${name}`,
    download: async (downloadScope, folder, name, url, signal) => {
      downloads.push({ scope: downloadScope, url, signal });
      return await Promise.resolve(`file:///cache/${folder}/${name}`);
    },
  };
  const context = {
    client,
    scope,
    scheduler: createRequestScheduler({ quietMs: 0 }),
  };
  return { transport, requests, context, device, downloads };
};

const leadSheet = {
  songId: "5501",
  arrangementId: "55011",
  attachment: byId("88005"),
};

describe("attachment reads through the product client", () => {
  it("lists an arrangement's files at the declared path under the account scope", async () => {
    const { context, requests } = setup();
    const options = attachmentReads.list(context, "5501", "55011");
    const list = await new QueryClient().query(options);
    expect([
      new URL(requests[0]?.url ?? "").pathname,
      options.queryKey,
      list.attachments.length,
    ]).toStrictEqual([
      "/api/v1/songs/5501/arrangements/55011/attachments",
      ["account-a", "songs.attachments", "5501", "55011"],
      7,
    ]);
  });

  it("opens a key's file with its key, then downloads it without credentials", async () => {
    const { context, device, downloads, requests } = setup();
    const saved = await new QueryClient().query(
      attachmentReads.file(context, device, leadSheet)
    );
    const url = new URL(requests[0]?.url ?? "");
    expect([
      url.pathname,
      url.searchParams.get("keyId"),
      downloads.map(({ scope, url: link }) => [scope, link]),
      saved.name,
    ]).toStrictEqual([
      "/api/v1/songs/5501/arrangements/55011/attachments/88005/link",
      "550112",
      [["account-a", "https://fixtures.invalid/attachments/88005"]],
      "Morning Light - Lead Sheet (A).pdf",
    ]);
  });

  it("refuses a signed link that is not https and downloads nothing", async () => {
    const { context, device, downloads, transport } = setup();
    vi.spyOn(transport, "handle").mockResolvedValueOnce({
      url: "http://files.example/88005",
    });
    const options = {
      ...attachmentReads.file(context, device, leadSheet),
      retry: false,
    };
    await expect(new QueryClient().query(options)).rejects.toBeInstanceOf(
      PreviewError
    );
    expect(downloads).toStrictEqual([]);
  });

  it("passes the query's signal to the download, so leaving the screen stops it", async () => {
    const { context, device, downloads } = setup();
    await new QueryClient().query(
      attachmentReads.file(context, device, leadSheet)
    );
    expect(downloads[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("shows Planning Center's refusal as a typed fault", async () => {
    const { context, transport } = setup();
    vi.spyOn(transport, "handle").mockRejectedValueOnce(
      new Forbidden({ message: "Your song access is None." })
    );
    const options = {
      ...attachmentReads.stream(context, {
        ...leadSheet,
        attachment: byId("88001"),
      }),
      retry: false,
    };
    await expect(new QueryClient().query(options)).rejects.toBeInstanceOf(
      Forbidden
    );
  });

  it("persists the file list but never a signed link or a file path", async () => {
    const { context, device } = setup();
    const cache = new QueryClient();
    await cache.query(attachmentReads.list(context, "5501", "55011"));
    await cache.query(attachmentReads.file(context, device, leadSheet));
    const stream = attachmentReads.stream(context, {
      ...leadSheet,
      attachment: byId("88001"),
    });
    // Observed, as an open player holds it; gcTime 0 drops it once nothing does.
    const stop = new QueryObserver(cache, stream).subscribe(() => {
      // Holding the query is enough; its updates do not matter here.
    });
    await vi.waitFor(() => {
      expect(cache.getQueryData(stream.queryKey)).toBe(
        "https://fixtures.invalid/attachments/88001"
      );
    });
    const persisted: unknown = JSON.parse(
      serializeQueryCache({
        timestamp: 0,
        buster: "",
        clientState: dehydrate(cache),
      })
    );
    expect(persisted).toMatchObject({
      clientState: {
        queries: [
          { queryKey: ["account-a", "songs.attachments", "5501", "55011"] },
        ],
      },
    });
    stop();
  });
});

describe(fixturePreviewFiles, () => {
  it("draws fixture files from bundled bytes and refuses fixture links without one", async () => {
    const writes: string[] = [];
    const device: PreviewFiles = {
      writeBase64: (_scope, _folder, name, base64) => {
        writes.push(`${name}:${base64.slice(0, 5)}`);
        return `file:///${name}`;
      },
      download: async () => await Promise.reject(new Error("network")),
    };
    const files = fixturePreviewFiles(device);
    const { signal } = new AbortController();
    await files.download(
      "demo",
      "f",
      "Lead.pdf",
      "https://fixtures.invalid/attachments/88005",
      signal
    );
    await expect(
      files.download(
        "demo",
        "f",
        "Demo.mp3",
        "https://fixtures.invalid/attachments/88001",
        signal
      )
    ).rejects.toThrow("no stored file");
    expect(writes).toStrictEqual(["Lead.pdf:JVBER"]);
  });
});
