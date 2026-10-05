import {
  isProviderFileUrl,
  readFilePdf,
} from "@pcobooster/api/modules/planning-center/file-pdf";
import {
  listPlanFiles,
  normalizePlanFile,
  openPlanFile,
} from "@pcobooster/api/modules/planning-center/plan-files";
import type { PlanningCenterAttachmentsService } from "@pcobooster/api/planning-center/services/attachments-service";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const file = {
  type: "Attachment",
  id: "chart-1",
  attributes: {
    filename: "Chart.pdf",
    content_type: "audio/mpeg",
    downloadable: true,
    allow_mp3_download: false,
    pco_type: "ChordChart",
  },
  relationships: { attachable: { data: { type: "Key", id: "key-1" } } },
};
describe("Plan files", () => {
  it("preserves owner and explicit preview/download restrictions", () => {
    expect(normalizePlanFile(file)).toMatchObject({
      name: "Chart.pdf",
      ownerType: "Key",
      ownerId: "key-1",
      hasPreview: false,
      downloadable: false,
      streamable: false,
      providerType: "ChordChart",
    });
  });

  it("returns a continuation rather than truncating a large plan", async () => {
    const list = vi.fn<PlanningCenterAttachmentsService["list"]>(() =>
      Effect.succeed({
        data: [file],
        links: { next: "https://api.planningcenteronline.com/next" },
        meta: { next: { offset: 100 } },
      })
    );
    const result = await Effect.runPromise(
      listPlanFiles(
        { serviceTypeId: "78289", planId: "89633542", offset: 0 },
        { list }
      )
    );
    expect(result.nextOffset).toBe(100);
    expect(list).toHaveBeenCalledExactlyOnceWith("78289", "89633542", 0);
  });

  it("finishes only when the provider has no next page", async () => {
    const result = await Effect.runPromise(
      listPlanFiles(
        { serviceTypeId: "78289", planId: "89633542", offset: 100 },
        { list: () => Effect.succeed({ data: [file] }) }
      )
    );
    expect(result.nextOffset).toBeNull();
  });

  it("resolves only secure links and scopes access to the selected plan", async () => {
    const input = {
      serviceTypeId: "78289",
      planId: "89633542",
      attachmentId: "chart-1",
      preview: false,
      pdf: false,
    };
    const open = vi.fn<PlanningCenterAttachmentsService["open"]>(() =>
      Effect.succeed({
        data: {
          ...file,
          attributes: { attachment_url: "https://files.example/chart.pdf" },
        },
      })
    );
    await expect(
      Effect.runPromise(
        openPlanFile(input, {
          open,
          get: () =>
            Effect.succeed({
              data: { ...file, attributes: { downloadable: true } },
            }),
        })
      )
    ).resolves.toStrictEqual({
      url: "https://files.example/chart.pdf",
      preview: false,
    });
    expect(open).toHaveBeenCalledExactlyOnceWith(
      "78289",
      "89633542",
      "chart-1",
      false
    );
    await expect(
      Effect.runPromise(
        openPlanFile(input, {
          get: () =>
            Effect.succeed({
              data: { ...file, attributes: { downloadable: true } },
            }),
          open: () =>
            Effect.succeed({
              data: {
                ...file,
                attributes: {
                  attachment_url: "http://files.example/chart.pdf",
                },
              },
            }),
        })
      )
    ).rejects.toThrow("secure file link");
  });

  it("rejects private and deceptive hosts for server PDF downloads", () => {
    expect(
      isProviderFileUrl("https://bucket.s3.amazonaws.com/chart.pdf")
    ).toBeTruthy();
    for (const url of [
      "http://bucket.s3.amazonaws.com/chart.pdf",
      "https://127.0.0.1/chart.pdf",
      "https://amazonaws.com.evil.example/chart.pdf",
      "https://user:pass@bucket.s3.amazonaws.com/chart.pdf",
      "https://bucket.s3.amazonaws.com:8443/chart.pdf",
    ]) {
      expect(isProviderFileUrl(url)).toBeFalsy();
    }
  });

  it("rejects non-PDF content and validates redirects explicitly", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => await Promise.resolve(new Response("<html>not a PDF</html>"))
    );
    await expect(
      Effect.runPromise(
        readFilePdf("https://bucket.s3.amazonaws.com/chart.pdf", fetch)
      )
    ).rejects.toThrow("not a PDF");
    expect(fetch.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("does not follow a redirect to a private host", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        await Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "https://127.0.0.1/private" },
          })
        )
    );
    await expect(
      Effect.runPromise(
        readFilePdf("https://bucket.s3.amazonaws.com/chart.pdf", fetch)
      )
    ).rejects.toThrow("own viewer");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("blocks non-streamable restricted files before opening", async () => {
    const open = vi.fn<PlanningCenterAttachmentsService["open"]>();
    await expect(
      Effect.runPromise(
        openPlanFile(
          {
            serviceTypeId: "1",
            planId: "2",
            attachmentId: "3",
            preview: false,
            pdf: false,
          },
          {
            open,
            get: () =>
              Effect.succeed({
                data: {
                  ...file,
                  attributes: {
                    downloadable: false,
                    web_streamable: false,
                    has_preview: false,
                  },
                },
              }),
          }
        )
      )
    ).rejects.toThrow("does not allow");
    expect(open).not.toHaveBeenCalled();
  });

  it("forces the permitted preview for a restricted document", async () => {
    const open = vi.fn<PlanningCenterAttachmentsService["open"]>(() =>
      Effect.succeed({
        data: {
          ...file,
          attributes: { attachment_url: "https://files.example/preview.jpg" },
        },
      })
    );
    await expect(
      Effect.runPromise(
        openPlanFile(
          {
            serviceTypeId: "1",
            planId: "2",
            attachmentId: "3",
            preview: false,
            pdf: false,
          },
          {
            open,
            get: () =>
              Effect.succeed({
                data: {
                  ...file,
                  attributes: { downloadable: false, has_preview: true },
                },
              }),
          }
        )
      )
    ).resolves.toStrictEqual({
      url: "https://files.example/preview.jpg",
      preview: true,
    });
    expect(open).toHaveBeenCalledExactlyOnceWith("1", "2", "3", true);
  });
});
