import { makeProductClient } from "@pcobooster/client/product-client";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { Forbidden } from "@pcobooster/contracts/faults/forbidden";
import { songAttachmentsSchema } from "@pcobooster/contracts/http/songs";
import { QueryClient, QueryObserver, dehydrate } from "@tanstack/react-query";
import { Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import { serializeQueryCache } from "../../app-shell/query-persistence";
import { fixtureMedia, fixtureToneWav } from "../../harness/fixture-media";
import { fixturePreviewStore } from "../../harness/fixture-preview-files";
import attachmentsFixture from "../../harness/fixtures/songs.attachments.json";
import { makeControlledFixture } from "../../harness/testing/controlled-fixture";
import { makeMemoryPreviewStore } from "../../harness/testing/memory-preview-store";
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
import { guardPreviewStore } from "./preview-store";
import { PreviewError } from "./previews";

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

const setup = (
  scope = "account-a",
  options: Parameters<typeof makeMemoryPreviewStore>[0] = {}
) => {
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
  const memory = makeMemoryPreviewStore(options);
  const previews = guardPreviewStore(memory.store);
  const context = {
    client,
    scope,
    scheduler: createRequestScheduler({ quietMs: 0 }),
  };
  return {
    transport,
    requests,
    context,
    device: previews.files,
    clear: previews.clear,
    downloads: memory.downloads,
    memory,
  };
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
    const { promise: landed, resolve: land } = Promise.withResolvers<boolean>();
    const { context, device, downloads } = setup("account-a", {
      beforeSave: async () => {
        await landed;
      },
    });
    const cache = new QueryClient();
    const options = attachmentReads.file(context, device, leadSheet);
    const read = cache.query(options);
    await vi.waitFor(() => {
      expect(downloads).toHaveLength(1);
    });
    expect(downloads[0]?.signal.aborted).toBeFalsy();
    await cache.cancelQueries({ queryKey: options.queryKey });
    expect(downloads[0]?.signal.aborted).toBeTruthy();
    land(true);
    await expect(read).rejects.toMatchObject({ message: "CancelledError" });
  });

  it("shows Planning Center's refusal as a typed fault", async () => {
    const { context, device, transport } = setup();
    vi.spyOn(transport, "handle").mockRejectedValueOnce(
      new Forbidden({ message: "Your song access is None." })
    );
    const options = {
      ...attachmentReads.stream(context, device, {
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
    const stream = attachmentReads.stream(context, device, {
      ...leadSheet,
      attachment: byId("88001"),
    });
    // Observed, as an open player holds it.
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

describe("attachment downloads and forgetting", () => {
  it("removes a download that lands after the previews were cleared, and fails it", async () => {
    const { promise: landed, resolve: land } = Promise.withResolvers<boolean>();
    const { context, device, clear, memory } = setup("account-a", {
      beforeSave: async () => {
        await landed;
      },
    });
    const read = new QueryClient().query({
      ...attachmentReads.file(context, device, leadSheet),
      retry: false,
    });
    await vi.waitFor(() => {
      expect(memory.downloads).toHaveLength(1);
    });
    clear();
    land(true);
    await expect(read).rejects.toMatchObject({ reason: "forgotten" });
    expect([...memory.saved.keys()]).toStrictEqual([]);
  });

  it("removes a download that lands after its screen left", async () => {
    const { promise: landed, resolve: land } = Promise.withResolvers<boolean>();
    const { context, device, memory } = setup("account-a", {
      beforeSave: async () => {
        await landed;
      },
    });
    const cache = new QueryClient();
    const options = attachmentReads.file(context, device, leadSheet);
    const read = cache.query(options);
    await vi.waitFor(() => {
      expect(memory.downloads).toHaveLength(1);
    });
    await cache.cancelQueries({ queryKey: options.queryKey });
    land(true);
    await expect(read).rejects.toBeDefined();
    await vi.waitFor(() => {
      expect([...memory.saved.keys()]).toStrictEqual([]);
    });
  });

  it("downloads a purged file again on the next read, and not while it is still saved", async () => {
    const { context, device, memory } = setup();
    const cache = new QueryClient();
    const options = attachmentReads.file(context, device, leadSheet);
    const first = await cache.query(options);
    await cache.query(options);
    memory.evict(first.uri);
    const again = await cache.query(options);
    expect([memory.downloads.length, device.exists(again.uri)]).toStrictEqual([
      2,
      true,
    ]);
    cache.clear();
  });
});

describe(fixturePreviewStore, () => {
  it("draws fixture files from bundled bytes and refuses fixture links without one", async () => {
    const memory = makeMemoryPreviewStore();
    const writes: string[] = [];
    const device = {
      ...memory.store,
      writeBase64: (
        scope: string,
        folder: string,
        name: string,
        base64: string
      ) => {
        writes.push(`${name}:${base64.slice(0, 5)}`);
        return memory.store.writeBase64(scope, folder, name, base64);
      },
      download: async () => await Promise.reject(new Error("network")),
    };
    const store = fixturePreviewStore(device);
    const { signal } = new AbortController();
    await store.download(
      "demo",
      "f",
      "Lead.pdf",
      new URL("https://fixtures.invalid/attachments/88005"),
      signal
    );
    await expect(
      store.download(
        "demo",
        "f",
        "Stems.zip",
        new URL("https://fixtures.invalid/attachments/88006"),
        signal
      )
    ).rejects.toThrow("no stored file");
    expect(writes).toStrictEqual(["Lead.pdf:JVBER"]);
  });

  it("plays fixture audio and video from local synthetic files, offline", async () => {
    const memory = makeMemoryPreviewStore();
    const store = fixturePreviewStore(memory.store);
    const { signal } = new AbortController();
    const audio = await store.playable(
      "demo",
      "media-a",
      "Morning Light - Demo.mp3",
      new URL("https://fixtures.invalid/attachments/88001"),
      signal
    );
    const video = await store.playable(
      "demo",
      "media-v",
      "Morning Light - Rehearsal.mp4",
      new URL("https://fixtures.invalid/attachments/88002"),
      signal
    );
    const real = await store.playable(
      "demo",
      "media-r",
      "Real.mp3",
      new URL("https://files.example/signed/1?sig=a"),
      signal
    );
    const head = (uri: string) =>
      atob(memory.saved.get(uri) ?? "").slice(0, 12);
    expect([
      audio.endsWith("/Morning Light - Demo.wav"),
      head(audio).startsWith("RIFF"),
      head(audio).slice(8),
      video.endsWith("/Morning Light - Rehearsal.mp4"),
      head(video).slice(4, 8),
      real,
    ]).toStrictEqual([
      true,
      true,
      "WAVE",
      true,
      "ftyp",
      "https://files.example/signed/1?sig=a",
    ]);
  });

  it("generates a playable two-second tone", () => {
    const bytes = Uint8Array.from(
      atob(fixtureToneWav()),
      (character) => character.codePointAt(0) ?? 0
    );
    const view = new DataView(bytes.buffer);
    expect([
      bytes.length,
      view.getUint32(24, true),
      view.getUint32(40, true),
      Math.max(...bytes.slice(44)) > 200,
      [...fixtureMedia.keys()],
    ]).toStrictEqual([44 + 16_000, 8000, 16_000, true, ["88001", "88002"]]);
  });
});
