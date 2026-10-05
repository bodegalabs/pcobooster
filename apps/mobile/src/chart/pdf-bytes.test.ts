import { describe, expect, it } from "vitest";

import fixture from "../fixtures/chordCharts.pdf.json";
import { decodePdfBytes } from "./pdf-bytes";

describe("native PDF bytes", () => {
  it("decodes the original PDF fixture without browser atob", () => {
    expect(decodePdfBytes(fixture.default.data).slice(0, 5)).toStrictEqual(
      new Uint8Array([37, 80, 68, 70, 45])
    );
  });

  it("keeps binary bytes intact and rejects invalid base64", () => {
    expect(decodePdfBytes("AP+A/w==")).toStrictEqual(
      new Uint8Array([0, 255, 128, 255])
    );
    expect(() => decodePdfBytes("not a PDF")).toThrow(
      "Planning Center returned an invalid PDF."
    );
  });
});
