import type { TextContent } from "pdfjs-dist/types/src/display/api";
import { describe, expect, it } from "vitest";

import { readPdfText } from "./pdf-pages";

describe(readPdfText, () => {
  it("reads PDF text without ReadableStream async iteration", async () => {
    const stream = new ReadableStream<TextContent>({
      start(controller) {
        controller.enqueue({
          items: [
            {
              str: "Chord",
              dir: "ltr",
              width: 1,
              height: 1,
              transform: [],
              fontName: "font",
              hasEOL: false,
            },
            { type: "beginMarkedContent", id: "marker" },
          ],
          styles: {},
          lang: null,
        });
        controller.enqueue({
          items: [
            {
              str: "chart",
              dir: "ltr",
              width: 1,
              height: 1,
              transform: [],
              fontName: "font",
              hasEOL: false,
            },
          ],
          styles: {},
          lang: null,
        });
        controller.close();
      },
    });
    Object.defineProperty(stream, Symbol.asyncIterator, { value: undefined });
    await expect(readPdfText(stream)).resolves.toBe("Chord chart");
    expect(stream.locked).toBeFalsy();
  });
});
