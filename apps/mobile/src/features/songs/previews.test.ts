import { makeProductClient } from "@pcobooster/client/product-client";
import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { serializeQueryCache } from "../../app-shell/query-persistence";
import pdfFixture from "../../harness/fixtures/chordCharts.pdf.json";
import { makeControlledFixture } from "../../harness/testing/controlled-fixture";
import type { ChartTarget } from "./chart";
import { previewReads, songChartPdfHref } from "./preview-reads";
import {
  PreviewError,
  chartPdfFileName,
  isPdfBase64,
  previewScopeFolder,
  safeFileName,
  secureUrl,
} from "./previews";
import type { PreviewFiles } from "./previews";

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
  const writes: { scope: string; folder: string; name: string }[] = [];
  const files: PreviewFiles = {
    writeBase64: (writeScope, folder, name) => {
      writes.push({ scope: writeScope, folder, name });
      return `file:///cache/${folder}/${name}`;
    },
    download: () => {
      throw new Error("not used");
    },
  };
  const context = {
    client,
    scope,
    scheduler: createRequestScheduler({ quietMs: 0 }),
  };
  return { transport, requests, context, files, writes };
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
    await expect(new QueryClient().query(options)).rejects.toBeInstanceOf(
      NotFound
    );
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
