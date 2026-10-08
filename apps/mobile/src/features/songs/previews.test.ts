import { makeProductClient } from "@pcobooster/client/product-client";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { QueryClient, QueryObserver, dehydrate } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { serializeQueryCache } from "../../app-shell/query-persistence";
import pdfFixture from "../../harness/fixtures/chordCharts.pdf.json";
import { makeControlledFixture } from "../../harness/testing/controlled-fixture";
import { makeMemoryPreviewStore } from "../../harness/testing/memory-preview-store";
import type { ChartTarget } from "./chart";
import { holdKeepAwake, applyPlaybackPolicy } from "./preview-lifecycle";
import { previewReads, songChartPdfHref } from "./preview-reads";
import {
  initialPreviewRender,
  previewRenderReducer,
  previewRenderStatus,
} from "./preview-render";
import { guardPreviewStore } from "./preview-store";
import {
  PreviewError,
  chartPdfFileName,
  isPdfBase64,
  previewScopeFolder,
  safeFileName,
  secureUrl,
} from "./previews";

const key = (startingKey: string | null, name = "Original"): ChartTarget => ({
  kind: "key",
  key: { id: "550111", name, startingKey, endingKey: null },
});

describe("preview file names", () => {
  it("names a chart PDF after the song and its key or lyrics, as Swift did", () => {
    expect(chartPdfFileName("Morning Light", key("G"))).toBe(
      "Morning Light (G).pdf"
    );
    expect(chartPdfFileName("Morning Light", { kind: "lyrics" })).toBe(
      "Morning Light (Lyrics).pdf"
    );
    expect(chartPdfFileName("Morning Light", key(null))).toBe(
      "Morning Light.pdf"
    );
  });

  it("keeps path separators, controls, and leading dots out of a file name", () => {
    expect(safeFileName("../etc/passwd", "file")).toBe("etc passwd");
    expect(safeFileName("AC/DC: Live\u0000.pdf", "file")).toBe(
      "AC DC Live .pdf"
    );
    expect(safeFileName(" ... ", "Chord chart.pdf")).toBe("Chord chart.pdf");
  });

  it("shortens a long name but keeps its extension", () => {
    const name = safeFileName(`${"a".repeat(300)}.mp3`, "file");
    expect(name).toHaveLength(120);
    expect(name.endsWith(".mp3")).toBeTruthy();
  });
});

describe("preview safety rules", () => {
  it("gives every account scope its own folder", () => {
    expect(previewScopeFolder("user:1:org:2")).not.toBe(
      previewScopeFolder("user_1_org_2")
    );
    expect(previewScopeFolder("demo")).toBe("64656d6f");
  });

  it("opens only https links", () => {
    expect(secureUrl("https://files.example/a.pdf?sig=1")?.hostname).toBe(
      "files.example"
    );
    expect(secureUrl("http://files.example/a.pdf")).toBeNull();
    expect(secureUrl("file:///etc/hosts")).toBeNull();
    // oxlint-disable-next-line no-script-url -- the case under test
    expect(secureUrl("javascript:alert(1)")).toBeNull();
    expect(secureUrl("not a url")).toBeNull();
  });

  it("refuses a link with an embedded user name or password", () => {
    expect(secureUrl("https://user:secret@files.example/a.pdf")).toBeNull();
    expect(secureUrl("https://user@files.example/a.pdf")).toBeNull();
    expect(secureUrl("https://:secret@files.example/a.pdf")).toBeNull();
  });

  it("recognizes a PDF by its header", () => {
    expect(isPdfBase64(pdfFixture.default.data)).toBeTruthy();
    expect(isPdfBase64(btoa("<html></html>"))).toBeFalsy();
  });

  it("builds the PDF view's link like the chart's", () => {
    expect(songChartPdfHref("5501", "55011", "key-550112")).toBe(
      "/songs/5501/pdf?arrangement=55011&target=key-550112"
    );
    expect(songChartPdfHref("a/b")).toBe("/songs/a%2Fb/pdf");
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
  const memory = makeMemoryPreviewStore();
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
    files: previews.files,
    clear: previews.clear,
    writes: memory.writes,
    memory,
  };
};

const input = {
  songId: "5501",
  songTitle: "Morning Light",
  arrangementId: "55011",
  updatedAt: "2026-09-24T03:12:45Z",
  target: key("A", "Jordan's key"),
};

describe("the chart PDF read", () => {
  it("reads the key's PDF at its declared path and saves it under the account scope", async () => {
    const { context, files, requests, writes } = setup();
    const options = previewReads.chartPdf(context, files, input);
    const file = await new QueryClient().query(options);
    const url = new URL(requests[0]?.url ?? "");
    expect(url.pathname).toBe("/api/v1/songs/5501/arrangements/55011/pdf");
    expect(url.searchParams.get("keyId")).toBe("550111");
    expect(writes.map(({ scope, name }) => ({ scope, name }))).toStrictEqual([
      { scope: "account-a", name: "Morning Light (A).pdf" },
    ]);
    expect([writes[0]?.folder.startsWith("chart-"), file.name]).toStrictEqual([
      true,
      "Morning Light (A).pdf",
    ]);
    expect(options.queryKey).toStrictEqual([
      "account-a",
      "preview.chartPdf",
      "5501",
      "55011",
      "key-550111",
      "2026-09-24T03:12:45Z",
    ]);
  });

  it("asks for the lyrics sheet without a key", async () => {
    const { context, files, requests } = setup();
    await new QueryClient().query(
      previewReads.chartPdf(context, files, {
        ...input,
        target: { kind: "lyrics" },
      })
    );
    expect(
      new URL(requests[0]?.url ?? "").searchParams.has("keyId")
    ).toBeFalsy();
  });

  it("refuses a file that is not a PDF and saves nothing", async () => {
    const { context, files, transport, writes } = setup();
    vi.spyOn(transport, "handle").mockResolvedValueOnce({
      data: btoa("<html><script>alert(1)</script></html>"),
    });
    const options = {
      ...previewReads.chartPdf(context, files, input),
      retry: false,
    };
    await expect(new QueryClient().query(options)).rejects.toBeInstanceOf(
      PreviewError
    );
    expect(writes).toStrictEqual([]);
  });

  it("surfaces a key Planning Center can't render as NotFound", async () => {
    const { context, files, transport } = setup();
    vi.spyOn(transport, "handle").mockRejectedValueOnce(
      new NotFound({ message: "No chart for this key.", resource: "chart" })
    );
    const options = {
      ...previewReads.chartPdf(context, files, input),
      retry: false,
    };
    await expect(new QueryClient().query(options)).rejects.toMatchObject({
      _tag: "NotFound",
      message: "No chart for this key.",
      resource: "chart",
    });
  });

  it("never lands in the persisted cache, so no file path outlives the session", async () => {
    const { context, files } = setup();
    const cache = new QueryClient();
    await cache.query(previewReads.chartPdf(context, files, input));
    const persisted: unknown = JSON.parse(
      serializeQueryCache({
        timestamp: 0,
        buster: "",
        clientState: dehydrate(cache),
      })
    );
    expect(persisted).toMatchObject({ clientState: { queries: [] } });
  });
});

describe("a saved chart PDF's lifetime", () => {
  it("writes the file again when the system purged it, while the cache still holds the read", async () => {
    const { context, files, memory, requests } = setup();
    const cache = new QueryClient();
    const options = previewReads.chartPdf(context, files, input);
    const first = await cache.query(options);
    memory.evict(first.uri);
    const reopened = await cache.query(options);
    expect([
      requests.length,
      memory.writes.length,
      files.exists(reopened.uri),
    ]).toStrictEqual([2, 2, true]);
    cache.clear();
  });

  it("never reads a PDF again while its file is still on the device", async () => {
    const { context, files, requests } = setup();
    const cache = new QueryClient();
    const options = previewReads.chartPdf(context, files, input);
    await cache.query(options);
    await cache.query(options);
    expect(requests).toHaveLength(1);
    cache.clear();
  });

  it("restores a purged file when its screen shows again, as a hidden route's observer resumes", async () => {
    const { context, files, memory, requests } = setup();
    const cache = new QueryClient();
    const options = previewReads.chartPdf(context, files, input);
    const observer = new QueryObserver(cache, options);
    const stop = observer.subscribe(() => {
      // Holding the read open, as the PDF screen does.
    });
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().data).toBeDefined();
    });
    // Hidden (`useVisibleQuery` disables it), purged, then shown again.
    observer.setOptions({ ...options, enabled: false });
    memory.evict(observer.getCurrentResult().data?.uri ?? "");
    observer.setOptions({ ...options, enabled: true });
    await vi.waitFor(() => {
      expect(requests).toHaveLength(2);
    });
    await vi.waitFor(() => {
      expect(
        files.exists(observer.getCurrentResult().data?.uri ?? "")
      ).toBeTruthy();
    });
    stop();
    cache.clear();
  });

  it("refuses to write a PDF whose read began before the previews were cleared", async () => {
    const { context, files, clear, memory, transport } = setup();
    const handle = transport.handle.bind(transport);
    vi.spyOn(transport, "handle").mockImplementationOnce(async (...args) => {
      // An account is forgotten while Planning Center is still rendering.
      clear();
      return await handle(...args);
    });
    const options = {
      ...previewReads.chartPdf(context, files, input),
      retry: false,
    };
    await expect(new QueryClient().query(options)).rejects.toMatchObject({
      reason: "forgotten",
    });
    expect([...memory.saved.keys()]).toStrictEqual([]);
  });
});

describe("a drawing's failure and Try again", () => {
  const uri = "file:///cache/song-previews/a/chart/Morning.pdf";

  it("fails only the drawing that failed; the same URI saved again draws afresh", () => {
    const drawing = previewRenderStatus(initialPreviewRender, uri, 1);
    const failed = previewRenderReducer(initialPreviewRender, {
      type: "failed",
      key: drawing.key,
    });
    expect(previewRenderStatus(failed, uri, 1).failed).toBeTruthy();
    // The read saved a newer copy at the same path.
    expect(previewRenderStatus(failed, uri, 2).failed).toBeFalsy();
  });

  it("draws anew after Try again, even when the read again failed", () => {
    const drawing = previewRenderStatus(initialPreviewRender, uri, 1);
    const failed = previewRenderReducer(initialPreviewRender, {
      type: "failed",
      key: drawing.key,
    });
    const retrying = previewRenderReducer(failed, { type: "retry" });
    const retried = previewRenderReducer(retrying, { type: "retried" });
    const next = previewRenderStatus(retried, uri, 1);
    expect([
      previewRenderStatus(retrying, uri, 1).retrying,
      next.failed,
      next.key === drawing.key,
    ]).toStrictEqual([true, false, false]);
  });

  it("ignores a late failure from a drawing already replaced", () => {
    const old = previewRenderStatus(initialPreviewRender, uri, 1);
    const late = previewRenderReducer(
      previewRenderReducer(initialPreviewRender, { type: "retried" }),
      { type: "failed", key: old.key }
    );
    expect(previewRenderStatus(late, uri, 1).failed).toBeFalsy();
  });
});

describe("what a preview holds only while on screen", () => {
  it("keeps a returned screen awake when its old activation finishes late", async () => {
    const oldActivation = Promise.withResolvers<boolean>();
    const held = new Set<string>();
    let activations = 0;
    const activate = async (tag: string) => {
      activations += 1;
      if (activations === 1) {
        await oldActivation.promise;
      }
      held.add(tag);
    };
    const deactivate = vi.fn<(tag: string) => Promise<void>>(async (tag) => {
      held.delete(tag);
      await Promise.resolve();
    });
    const leaveOld = holdKeepAwake("same-screen", activate, deactivate);
    leaveOld();
    const leaveReturned = holdKeepAwake("same-screen", activate, deactivate);
    await Promise.resolve();
    expect(held.size).toBe(1);
    oldActivation.resolve(true);
    await vi.waitFor(() => {
      expect(deactivate).toHaveBeenCalledTimes(2);
    });
    expect(held.size).toBe(1);
    leaveReturned();
    expect(held.size).toBe(0);
  });

  it("releases keep-awake again when the screen left before activation finished", async () => {
    const activation = Promise.withResolvers<boolean>();
    const calls: string[] = [];
    let acquiredTag = "";
    const release = holdKeepAwake(
      "song-preview-1",
      async (tag) => {
        acquiredTag = tag;
        calls.push(`activate ${tag}`);
        await activation.promise;
      },
      async (tag) => {
        calls.push(`deactivate ${tag}`);
        await Promise.resolve();
      }
    );
    release();
    activation.resolve(true);
    await vi.waitFor(() => {
      expect(calls).toStrictEqual([
        `activate ${acquiredTag}`,
        `deactivate ${acquiredTag}`,
        `deactivate ${acquiredTag}`,
      ]);
    });
  });

  it("keeps the screen awake until released when activation comes first", async () => {
    const calls: string[] = [];
    const release = holdKeepAwake(
      "song-preview-2",
      async () => {
        calls.push("activate");
        await Promise.resolve();
      },
      async () => {
        calls.push("deactivate");
        await Promise.resolve();
      }
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toStrictEqual(["activate"]);
    release();
    expect(calls).toStrictEqual(["activate", "deactivate"]);
  });

  it("pauses media when its screen hides and never plays in the background", () => {
    const player = {
      pause: vi.fn<() => void>(),
      staysActiveInBackground: true,
      showNowPlayingNotification: true,
    };
    applyPlaybackPolicy(player, true);
    expect([
      player.pause.mock.calls.length,
      player.staysActiveInBackground,
      player.showNowPlayingNotification,
    ]).toStrictEqual([0, false, false]);
    applyPlaybackPolicy(player, false);
    expect(player.pause).toHaveBeenCalledOnce();
  });
});
